import { ExecutionEngine } from './execution-engine';
import { InlineStepScheduler } from './inline-step.scheduler';
import { NodeRegistry } from '../../nodes/node-registry';
import { NodeResolver } from '../../nodes/node-resolver';
import { CustomNodeService } from '../../custom-node/application/custom-node.service';
import { QuickJsSandbox } from '../../custom-node/infrastructure/quickjs-sandbox';
import type { EventDefinitionService } from '../../custom-event/application/event-definition.service';
import { InMemoryCustomNodes, riskNodeSpec } from '../../../testing/custom-node-fakes';
import { FixedScope, InMemoryExecutions, instantDrain, testNode } from '../../../testing/execution-fakes';
import { NonRetryableError, RetryableError } from '../../../shared/domain/errors';
import type { CodeSandbox } from '../../custom-node/application/code-sandbox.ports';
import type { WorkflowDefinition } from '../../workflow/domain/workflow-definition.types';

const node = testNode;

describe('ExecutionEngine', () => {
  let flaky: jest.Mock;
  let repo: InMemoryExecutions;
  let scheduler: InlineStepScheduler;
  let engine: ExecutionEngine;

  beforeEach(() => {
    flaky = jest.fn();
    repo = new InMemoryExecutions();
    scheduler = new InlineStepScheduler();
    const registry = new NodeRegistry([
      node('t', ['default'], async () => ({ outputHandle: 'default', output: {} }), { isTrigger: true }),
      node('cond', ['true', 'false'], async (ctx) => ({ outputHandle: ctx.config.go ? 'true' : 'false', output: {}, contextPatch: { branched: true } })),
      node('ok', ['default'], async (ctx) => ({ outputHandle: 'default', output: { saw: ctx.data.context.branched } })),
      node('wait', ['default'], async () => ({ outputHandle: 'default', output: {}, delayNextMs: 5000 })),
      node('flaky', ['success', 'failed'], flaky),
      node('fatal', ['default'], async () => {
        throw new NonRetryableError('bad config');
      }),
      // Saves `kb` kilobytes into the context under `key`.
      node('big', ['default', 'failed'], async (ctx) => ({
        outputHandle: 'default',
        output: { rows: 'y'.repeat(100 * 1024) },
        contextPatch: { [String(ctx.config.key ?? 'big')]: 'x'.repeat(Number(ctx.config.kb) * 1024) },
      })),
    ]);
    const resolver = new NodeResolver(registry, {} as CustomNodeService, {} as CodeSandbox, {} as EventDefinitionService);
    engine = new ExecutionEngine(repo, scheduler, resolver, new FixedScope());
  });

  const run = async (definition: WorkflowDefinition) => {
    const execution = await engine.start({
      tenantId: 't1',
      workflowId: 'wf',
      workflowName: 'Test',
      workflowVersion: 1,
      definition,
      trigger: { event: 'shipment.created', data: {} },
      shipmentId: null,
      mode: 'test',
    });
    await drain();
    return repo.executions.get(execution.id)!;
  };
  const drain = () => scheduler.drain((job, attempt, isFinal) => engine.runStep(job, attempt, isFinal).then(() => undefined), instantDrain);

  const n = (id: string, type: string, config: Record<string, unknown> = {}) => ({ id, type, name: id, position: { x: 0, y: 0 }, config });
  const e = (source: string, target: string, sourceHandle = 'default') => ({ id: `${source}-${target}`, source, target, sourceHandle });

  it('follows only the branch chosen by the node and shares context downstream', async () => {
    const result = await run({
      nodes: [n('t', 't'), n('c', 'cond', { go: true }), n('yes', 'ok'), n('no', 'ok')],
      edges: [e('t', 'c'), e('c', 'yes', 'true'), e('c', 'no', 'false')],
    });
    expect(result.status).toBe('succeeded');
    expect(repo.nodes.has('yes')).toBe(true);
    expect(repo.nodes.has('no')).toBe(false);
    expect(repo.nodes.get('yes')!.output).toEqual({ saw: true });
  });

  it('runs a merge node once and completes when all branches finish', async () => {
    const result = await run({
      nodes: [n('t', 't'), n('a', 'ok'), n('b', 'ok'), n('m', 'ok')],
      edges: [e('t', 'a'), e('t', 'b'), e('a', 'm'), e('b', 'm')],
    });
    expect(result.status).toBe('succeeded');
    expect(result.pendingSteps).toBe(0);
  });

  it('retries retryable errors and records the successful attempt', async () => {
    flaky.mockRejectedValueOnce(new RetryableError('503')).mockResolvedValue({ outputHandle: 'success', output: {} });
    const result = await run({ nodes: [n('t', 't'), n('f', 'flaky')], edges: [e('t', 'f')] });
    expect(result.status).toBe('succeeded');
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(repo.nodes.get('f')).toMatchObject({ status: 'succeeded', attempt: 2 });
  });

  it('routes exhausted failures to a wired "failed" branch', async () => {
    flaky.mockRejectedValue(new RetryableError('courier down'));
    const result = await run({
      nodes: [n('t', 't'), n('f', 'flaky'), n('alert', 'ok')],
      edges: [e('t', 'f'), e('f', 'alert', 'failed')],
    });
    expect(flaky).toHaveBeenCalledTimes(3);
    expect(repo.nodes.get('f')).toMatchObject({ status: 'failed', outputHandle: 'failed' });
    expect(repo.nodes.get('alert')!.status).toBe('succeeded');
    expect(result.status).toBe('succeeded');
  });

  it('fails the execution immediately on non-retryable errors', async () => {
    const result = await run({ nodes: [n('t', 't'), n('x', 'fatal'), n('after', 'ok')], edges: [e('t', 'x'), e('x', 'after')] });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('x: bad config');
    expect(repo.nodes.has('after')).toBe(false);
  });

  it('runs a custom node in the sandbox, following its output and merging its context', async () => {
    const customRepo = new InMemoryCustomNodes();
    const sandbox = new QuickJsSandbox();
    const customNodes = new CustomNodeService(customRepo, sandbox);
    const risk = await customNodes.create('t1', riskNodeSpec());
    const registry = (engine as unknown as { nodes: NodeResolver }).nodes.registry;
    engine = new ExecutionEngine(repo, scheduler, new NodeResolver(registry, customNodes, sandbox, {} as EventDefinitionService), new FixedScope({ id: 's1', codAmount: 5000 }));

    const result = await (async () => {
      const execution = await engine.start({
        tenantId: 't1',
        workflowId: 'wf',
        workflowName: 'Test',
        workflowVersion: 1,
        definition: {
          nodes: [n('t', 't'), { ...n('r', risk.type, { threshold: 2000 }), typeVersion: 1 }, n('hi', 'ok'), n('lo', 'ok')],
          edges: [e('t', 'r'), e('r', 'hi', 'risky'), e('r', 'lo', 'safe')],
        },
        trigger: { event: 'shipment.created', data: {} },
        shipmentId: 's1',
        mode: 'test',
      });
      await drain();
      return repo.executions.get(execution.id)!;
    })();

    expect(result.status).toBe('succeeded');
    expect(repo.nodes.get('r')).toMatchObject({ status: 'succeeded', outputHandle: 'risky', output: { result: { risky: true }, logs: ['cod 5000'], version: 1 } });
    expect(repo.nodes.has('hi')).toBe(true);
    expect(repo.nodes.has('lo')).toBe(false);
    expect(result.context).toMatchObject({ codRisk: 'high' });
  });

  it('fails the run without retrying when custom code throws', async () => {
    const customRepo = new InMemoryCustomNodes();
    const sandbox = new QuickJsSandbox();
    const customNodes = new CustomNodeService(customRepo, sandbox);
    const broken = await customNodes.create('t1', riskNodeSpec('function run() { throw new Error("oops"); }'));
    const registry = (engine as unknown as { nodes: NodeResolver }).nodes.registry;
    engine = new ExecutionEngine(repo, scheduler, new NodeResolver(registry, customNodes, sandbox, {} as EventDefinitionService), new FixedScope());
    const result = await run({ nodes: [n('t', 't'), n('b', broken.type)], edges: [e('t', 'b')] });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('COD risk check v1: oops');
    expect(repo.nodes.get('b')!.attempt).toBe(1);
  });

  it('schedules nodes after a delay as delayed jobs', async () => {
    const result = await run({ nodes: [n('t', 't'), n('w', 'wait'), n('after', 'ok')], edges: [e('t', 'w'), e('w', 'after')] });
    expect(scheduler.delays).toEqual([5000]);
    expect(result.status).toBe('succeeded');
  });

  it('fails a step whose result is too large to keep, and follows its Failed branch when wired', async () => {
    const result = await run({
      nodes: [n('t', 't'), n('huge', 'big', { kb: 1100 }), n('after', 'ok'), n('handled', 'ok')],
      edges: [e('t', 'huge'), e('huge', 'after'), e('huge', 'handled', 'failed')],
    });
    expect(result.status).toBe('succeeded');
    expect(repo.nodes.get('huge')).toMatchObject({ status: 'failed', outputHandle: 'failed', error: expect.stringContaining('a step can save at most 1.0 MB') });
    expect(repo.nodes.has('after')).toBe(false);
    expect(repo.nodes.has('handled')).toBe(true);
    // The next steps can tell what went wrong.
    expect(result.context).toEqual({ lastError: { step: 'huge', message: expect.stringContaining('produced 1.1 MB') } });
  });

  it('fails the run when the total saved data would pass the per-run limit', async () => {
    const result = await run({
      nodes: [n('t', 't'), ...[1, 2, 3, 4, 5].map((i) => n(`s${i}`, 'big', { kb: 900, key: `k${i}` }))],
      edges: [e('t', 's1'), e('s1', 's2'), e('s2', 's3'), e('s3', 's4'), e('s4', 's5')],
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain("The run's saved data would reach");
    expect(Object.keys(result.context)).toEqual(['k1', 'k2', 'k3', 'k4']);
  });

  it('keeps a bounded copy of large step input and output for the timeline', async () => {
    await run({ nodes: [n('t', 't'), n('a', 'big', { kb: 200 }), n('b', 'ok')], edges: [e('t', 'a'), e('a', 'b')] });
    expect(repo.nodes.get('a')!.output).toMatchObject({ truncated: true, sizeBytes: expect.any(Number), preview: expect.stringContaining('{"rows":"yyy') });
    // b's input holds the 200 KB context: the timeline keeps a preview, the step itself saw everything.
    expect(repo.nodes.get('b')!.input).toMatchObject({ truncated: true });
    expect(repo.nodes.get('b')!.output).toEqual({ saw: undefined });
  });

  it('starting twice with the same id creates one run and schedules its trigger once', async () => {
    const input = {
      id: 'ex_fixed',
      tenantId: 't1',
      workflowId: 'wf',
      workflowName: 'Test',
      workflowVersion: 1,
      definition: { nodes: [n('t', 't'), n('a', 'ok')], edges: [e('t', 'a')] },
      trigger: { event: 'shipment.created', data: {} },
      shipmentId: null,
      mode: 'trigger' as const,
    };
    await engine.start(input);
    await drain();
    const again = await engine.start(input);
    await drain();
    expect(repo.executions.size).toBe(1);
    expect(again).toMatchObject({ id: 'ex_fixed', status: 'succeeded' });
    expect(repo.nodes.get('a')!.attempt).toBe(1);
  });
});
