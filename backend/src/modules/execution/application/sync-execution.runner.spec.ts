import { ExecutionEngine } from './execution-engine';
import { SyncExecutionRunner } from './sync-execution.runner';
import { NodeRegistry } from '../../nodes/node-registry';
import { NodeResolver } from '../../nodes/node-resolver';
import type { CustomNodeService } from '../../custom-node/application/custom-node.service';
import type { EventDefinitionService } from '../../custom-event/application/event-definition.service';
import { FixedScope, InMemoryExecutions, testNode } from '../../../testing/execution-fakes';
import { NonRetryableError } from '../../../shared/domain/errors';
import type { CodeSandbox } from '../../custom-node/application/code-sandbox.ports';
import { StepScheduler } from '../domain/execution.ports';
import type { WorkflowDefinition } from '../../workflow/domain/workflow-definition.types';
import { sleep } from '../../../shared/util/async';

/** Sync runs must never touch the queue. */
class ForbiddenScheduler extends StepScheduler {
  async schedule(): Promise<void> {
    throw new Error('the queue must not be used for synchronous runs');
  }
}

describe('SyncExecutionRunner', () => {
  let repo: InMemoryExecutions;
  let runner: SyncExecutionRunner;
  const afterResponse = jest.fn();

  beforeEach(() => {
    afterResponse.mockReset();
    repo = new InMemoryExecutions();
    const registry = new NodeRegistry([
      testNode('t', ['default'], async () => ({ outputHandle: 'default', output: {} }), { isTrigger: true }),
      testNode('respond', ['default'], async (ctx) => {
        const response = { statusCode: Number(ctx.config.status ?? 200), headers: {}, body: { saw: ctx.data.context.value ?? null } };
        return { outputHandle: 'default', output: response, response };
      }),
      testNode('set', ['default'], async (ctx) => ({ outputHandle: 'default', output: {}, contextPatch: { value: ctx.config.value } })),
      testNode('slow', ['default'], async (ctx) => {
        await sleep(Number(ctx.config.ms));
        afterResponse();
        return { outputHandle: 'default', output: {} };
      }),
      testNode('wait', ['default'], async (ctx) => ({ outputHandle: 'default', output: {}, delayNextMs: Number(ctx.config.ms) })),
      testNode('boom', ['default'], async () => {
        throw new NonRetryableError('bad input');
      }),
    ]);
    const resolver = new NodeResolver(registry, {} as CustomNodeService, {} as CodeSandbox, {} as EventDefinitionService);
    const engine = new ExecutionEngine(repo, new ForbiddenScheduler(), resolver, new FixedScope());
    runner = new SyncExecutionRunner(engine, repo);
  });

  const n = (id: string, type: string, config: Record<string, unknown> = {}) => ({ id, type, name: id, position: { x: 0, y: 0 }, config });
  const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target, sourceHandle: 'default' });
  const run = (definition: WorkflowDefinition, timeoutMs = 2_000) =>
    runner.run(
      { tenantId: 't', workflowId: 'wf', workflowName: 'API', workflowVersion: 1, definition, trigger: { event: 'http.request', data: {} }, shipmentId: null, mode: 'api' },
      { timeoutMs },
    );

  it('answers as soon as a response step runs, then finishes the rest in the background', async () => {
    const result = await run({
      nodes: [n('t', 't'), n('s', 'set', { value: 42 }), n('r', 'respond', { status: 201 }), n('later', 'slow', { ms: 50 })],
      edges: [e('t', 's'), e('s', 'r'), e('r', 'later')],
    });
    expect(result).toEqual({ kind: 'response', executionId: expect.any(String), response: { statusCode: 201, headers: {}, body: { saw: 42 } } });
    expect(afterResponse).not.toHaveBeenCalled();
    await sleep(120);
    expect(afterResponse).toHaveBeenCalledTimes(1);
    const stored = repo.executions.get(result.executionId)!;
    expect(stored).toMatchObject({ status: 'succeeded', mode: 'api', response: { statusCode: 201 } });
  });

  it('reports completion when no response step exists', async () => {
    expect(await run({ nodes: [n('t', 't'), n('s', 'set', { value: 1 })], edges: [e('t', 's')] })).toMatchObject({ kind: 'completed', status: 'succeeded' });
  });

  it('reports a failed run with its error', async () => {
    expect(await run({ nodes: [n('t', 't'), n('b', 'boom')], edges: [e('t', 'b')] })).toMatchObject({ kind: 'completed', status: 'failed', error: 'b: bad input' });
  });

  it('times out slow steps and waits that exceed the budget, failing the run', async () => {
    const slow = await run({ nodes: [n('t', 't'), n('x', 'slow', { ms: 300 })], edges: [e('t', 'x')] }, 50);
    expect(slow).toMatchObject({ kind: 'timeout', timeoutMs: 50 });
    expect(repo.executions.get(slow.executionId)).toMatchObject({ status: 'failed', error: 'Timed out after 50 ms' });

    const waiting = await run({ nodes: [n('t', 't'), n('w', 'wait', { ms: 60_000 }), n('r', 'respond')], edges: [e('t', 'w'), e('w', 'r')] }, 100);
    expect(waiting.kind).toBe('timeout');
  });

  it('honours short waits inside the budget', async () => {
    const result = await run({ nodes: [n('t', 't'), n('w', 'wait', { ms: 30 }), n('r', 'respond')], edges: [e('t', 'w'), e('w', 'r')] });
    expect(result.kind).toBe('response');
  });
});
