import { ExecutionEngine } from '../../../execution/application/execution-engine';
import { InlineStepScheduler } from '../../../execution/application/inline-step.scheduler';
import { SyncExecutionRunner } from '../../../execution/application/sync-execution.runner';
import { WorkflowCallService } from '../../../execution/application/workflow-call.service';
import { NodeRegistry } from '../../node-registry';
import { NodeResolver } from '../../node-resolver';
import { TriggerHttpNode } from '../trigger/trigger-http.node';
import { HttpResponseNode } from '../response/http-response.node';
import { RunCodeNode } from '../transform/run-code.node';
import { AuthorizeNode } from '../access/authorize.node';
import { RunWorkflowNode } from './run-workflow.node';
import { WorkflowCalls } from '../../domain/workflow-caller';
import { httpTrigger, toWorkflowRequest } from '../../domain/triggers';
import { QuickJsSandbox } from '../../../custom-node/infrastructure/quickjs-sandbox';
import { FixedScope, InMemoryExecutions } from '../../../../testing/execution-fakes';
import { InvalidOperationError, NotFoundError } from '../../../../shared/domain/errors';
import type { CustomNodeService } from '../../../custom-node/application/custom-node.service';
import type { EventDefinitionService } from '../../../custom-event/application/event-definition.service';
import type { WorkflowService } from '../../../workflow/application/workflow.service';
import type { WorkflowDefinition, WorkflowNodeDef } from '../../../workflow/domain/workflow-definition.types';
import type { RawRequest } from '../../domain/triggers.types';

const node = (id: string, type: string, config: Record<string, unknown> = {}): WorkflowNodeDef => ({ id, type, name: id, position: { x: 0, y: 0 }, config });
const edge = (source: string, target: string, sourceHandle = 'default') => ({ id: `${source}-${sourceHandle}-${target}`, source, sourceHandle, target });
const respond = (id: string, statusCode: number, body: unknown) => node(id, 'http.response', { statusCode, body });
const flow = (nodes: WorkflowNodeDef[], edges: ReturnType<typeof edge>[]): WorkflowDefinition => ({ nodes: [node('trigger', 'trigger.http'), ...nodes], edges });

/** A caller workflow: one Run workflow step, then a response per path so each outcome is visible. */
const caller = (config: Record<string, unknown>) =>
  flow(
    [
      node('run', 'flow.run_workflow', { saveAs: 'result', ...config }),
      respond('ok', 200, { result: '{{context.result}}' }),
      respond('error', 502, { result: '{{context.result}}' }),
      respond('failed', 500, { error: '{{context.lastError.message}}' }),
    ],
    [edge('trigger', 'run'), edge('run', 'ok', 'ok'), edge('run', 'error', 'error'), edge('run', 'failed', 'failed')],
  );

const PRICE_CODE = `function run({ request }) {
  const subtotal = request.body.price * request.body.quantity;
  return { subtotal, total: subtotal > 5000 ? subtotal * 0.9 : subtotal };
}`;

/** The workflows a Run workflow step can call, as WorkflowService would resolve them. */
const PUBLISHED: Record<string, { name: string; triggerEvent: string | null; definition: WorkflowDefinition }> = {
  'wf-price': {
    name: 'Price order',
    triggerEvent: 'http.request',
    definition: flow(
      [
        node('price', 'code.run', { code: PRICE_CODE, saveAs: 'pricing' }),
        respond('answer', 200, { total: '{{context.pricing.total}}', calledFrom: '{{trigger.data.calledBy.workflowName}}' }),
      ],
      [edge('trigger', 'price'), edge('price', 'answer', 'success')],
    ),
  },
  'wf-echo': {
    name: 'Echo',
    triggerEvent: 'http.request',
    definition: flow([respond('answer', 200, { request: '{{request}}' })], [edge('trigger', 'answer')]),
  },
  'wf-admins': {
    name: 'Admins only',
    triggerEvent: 'http.request',
    definition: flow(
      [
        node('check', 'auth.authorize', { action: 'reports:read', roles: '{{request.auth.roles}}', policy: { statements: [{ effect: 'allow', actions: ['*'], resources: ['*'], roles: ['admin'] }] } }),
        respond('yes', 200, { user: '{{request.auth.id}}' }),
        respond('no', 403, { error: 'Admins only' }),
      ],
      [edge('trigger', 'check'), edge('check', 'yes', 'allowed'), edge('check', 'no', 'denied')],
    ),
  },
  'wf-reject': { name: 'Reject', triggerEvent: 'http.request', definition: flow([respond('answer', 409, { error: 'Out of stock' })], [edge('trigger', 'answer')]) },
  'wf-crash': {
    name: 'Crash',
    triggerEvent: 'http.request',
    definition: flow([node('boom', 'code.run', { code: 'function run() { throw new Error("no price list") }' })], [edge('trigger', 'boom')]),
  },
  'wf-silent': {
    name: 'Silent',
    triggerEvent: 'http.request',
    definition: flow([node('work', 'code.run', { code: 'function run() { return 1 }' })], [edge('trigger', 'work')]),
  },
  'wf-shipments': { name: 'Shipment flow', triggerEvent: 'shipment.created', definition: flow([], []) },
};
PUBLISHED['wf-loop'] = { name: 'Loop', triggerEvent: 'http.request', definition: caller({ workflowId: 'wf-loop' }) };

describe('Run workflow', () => {
  let executions: InMemoryExecutions;
  let queue: InlineStepScheduler;
  let engine: ExecutionEngine;
  let runner: SyncExecutionRunner;

  beforeEach(() => {
    const sandbox = new QuickJsSandbox();
    const calls = new WorkflowCalls();
    const registry = new NodeRegistry([new TriggerHttpNode(), new HttpResponseNode(), new RunCodeNode(sandbox), new AuthorizeNode(), new RunWorkflowNode(calls)]);
    const resolver = new NodeResolver(registry, {} as CustomNodeService, sandbox, {} as EventDefinitionService);
    executions = new InMemoryExecutions();
    queue = new InlineStepScheduler();
    engine = new ExecutionEngine(executions, queue, resolver, new FixedScope());
    runner = new SyncExecutionRunner(engine, executions);
    const workflows = {
      resolvePublished: async (_: string, id: string) => {
        const w = PUBLISHED[id];
        if (!w) throw new NotFoundError('Workflow', id);
        if (id === 'wf-draft') throw new InvalidOperationError('Workflow "Draft" is not published');
        return { workflow: { toJSON: () => ({ id, name: w.name, triggerEvent: w.triggerEvent }) }, version: { version: 3, definition: w.definition } };
      },
    } as unknown as WorkflowService;
    new WorkflowCallService(workflows, engine, runner, executions, calls).onModuleInit();
  });

  /** Runs a caller workflow as if its endpoint were called, and returns what the endpoint answers. */
  const runCaller = async (definition: WorkflowDefinition, request: RawRequest = {}) => {
    const result = await runner.run(
      {
        tenantId: 't',
        workflowId: 'wf-checkout',
        workflowName: 'Checkout',
        workflowVersion: 1,
        definition,
        trigger: httpTrigger(toWorkflowRequest({ method: 'POST', path: '/checkout', ...request }), { requestId: 'req-1' }),
        shipmentId: null,
        mode: 'api',
      },
      { timeoutMs: 5000 },
    );
    if (result.kind !== 'response') throw new Error(`caller ended without a response: ${JSON.stringify(result)}`);
    return { ...result.response, executionId: result.executionId };
  };
  const runOf = (id: string) => executions.executions.get(id)!;
  const childrenOf = (parentId: string) => [...executions.executions.values()].filter((e) => (e.trigger.data as { calledBy?: { executionId: string } }).calledBy?.executionId === parentId);

  it('passes a request it builds, waits, and saves what the workflow answered', async () => {
    const res = await runCaller(caller({ workflowId: 'wf-price', body: { price: '{{request.body.price}}', quantity: 3 } }), { body: { price: 2000 } });
    const [child] = childrenOf(res.executionId);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      result: { status: 200, ok: true, body: { total: 5400, calledFrom: 'Checkout' }, headers: {}, executionId: child.id, workflow: { id: 'wf-price', name: 'Price order', version: 3 } },
    });
    expect(child).toMatchObject({ workflowId: 'wf-price', workflowVersion: 3, mode: 'api', status: 'succeeded' });
    expect((child.trigger.data as { calledBy: unknown }).calledBy).toEqual({ executionId: res.executionId, nodeId: 'run', depth: 1, workflowId: 'wf-checkout', workflowName: 'Checkout' });
  });

  it('takes the Error response path when the workflow answers 4xx/5xx, with its answer saved', async () => {
    const res = await runCaller(caller({ workflowId: 'wf-reject' }));
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ result: { status: 409, ok: false, body: { error: 'Out of stock' } } });
  });

  it('counts a workflow that finishes without a Return response as OK (204, no body)', async () => {
    const res = await runCaller(caller({ workflowId: 'wf-silent' }));
    expect(res.body).toMatchObject({ result: { status: 204, ok: true, body: null } });
  });

  it('takes the Failed path, naming the workflow and its run, when it fails or can’t be run', async () => {
    const crashed = await runCaller(caller({ workflowId: 'wf-crash' }));
    const [child] = childrenOf(crashed.executionId);
    expect(crashed.statusCode).toBe(500);
    expect(crashed.body).toEqual({ error: expect.stringMatching(new RegExp(`^“Crash” \\(run ${child.id}\\) failed: .*no price list`)) });
    expect((await runCaller(caller({ workflowId: 'wf-nope' }))).body).toEqual({ error: expect.stringMatching(/wf-nope/) });
    expect((await runCaller(caller({ workflowId: 'wf-shipments' }))).body).toEqual({
      error: '“Shipment flow” starts with shipment.created — only workflows that start with an API request can be run',
    });
  });

  it('passes this run’s own request on, as the same caller — or as no caller', async () => {
    const request: RawRequest = {
      method: 'GET',
      path: '/orders/42',
      params: { id: '42' },
      query: { expand: 'items' },
      body: { note: 'hi' },
      auth: { type: 'jwt', id: 'u1', roles: ['admin'], context: { email: 'a@b.c' } },
    };
    const echoed = await runCaller(caller({ workflowId: 'wf-echo', request: 'forward' }), request);
    expect((echoed.body as { result: { body: { request: unknown } } }).result.body.request).toMatchObject({
      method: 'GET',
      path: '/orders/42',
      params: { id: '42' },
      query: { expand: 'items' },
      body: { note: 'hi' },
      auth: { id: 'u1', roles: ['admin'], context: { email: 'a@b.c' } },
    });
    expect((await runCaller(caller({ workflowId: 'wf-admins' }), request)).body).toMatchObject({ result: { status: 200, body: { user: 'u1' } } });
    expect((await runCaller(caller({ workflowId: 'wf-admins', runAsCaller: false }), request)).body).toMatchObject({ result: { status: 403 } });
  });

  it('builds a request with path params and query for workflows that read them', async () => {
    const res = await runCaller(caller({ workflowId: 'wf-echo', params: { id: '{{request.body.orderId}}' }, query: { page: 2 }, body: { qty: '{{request.body.qty}}' } }), {
      body: { orderId: 7, qty: 3 },
    });
    expect((res.body as { result: { body: { request: unknown } } }).result.body.request).toMatchObject({
      method: 'POST',
      path: '/',
      params: { id: '7' },
      query: { page: 2 },
      body: { qty: 3 },
    });
  });

  it('starts a workflow in the background and goes on at once', async () => {
    const res = await runCaller(caller({ workflowId: 'wf-price', mode: 'background', body: { price: 10, quantity: 1 } }));
    const started = (res.body as { result: { started: boolean; executionId: string } }).result;
    expect(res.statusCode).toBe(200);
    expect(started).toMatchObject({ started: true, workflow: { name: 'Price order' } });
    expect(started.executionId).toMatch(/^ex_[0-9a-f]{24}$/);
    expect(runOf(started.executionId).status).toBe('queued');
    expect(queue.pending).toBe(1);
    await queue.drain((job, attempt, isFinal) => engine.runStep(job, attempt, isFinal, queue).then(() => undefined));
    expect(runOf(started.executionId)).toMatchObject({ status: 'succeeded', response: { statusCode: 200, body: { total: 10 } } });
  });

  it('stops workflows that keep running each other after 5 levels', async () => {
    const res = await runCaller(PUBLISHED['wf-loop'].definition);
    expect(executions.executions.size).toBe(6); // the caller and five levels below it
    expect(JSON.stringify(res.body)).toContain('Workflows are running each other 5 levels deep — stopping here to prevent a loop');
  });

  it('checks its settings', () => {
    const step = new RunWorkflowNode(new WorkflowCalls());
    expect(step.validateConfig({ workflowId: 'wf', mode: 'wait', timeoutSeconds: 10 })).toEqual([]);
    expect(step.validateConfig({ workflowId: 'wf', timeoutSeconds: 31 })).toEqual(['Wait at most must be 1–30 seconds']);
    expect(step.validateConfig({ workflowId: 'wf', mode: 'later', query: '[1]' })).toEqual(['Query must be a JSON object', 'Mode must be wait or background']);
    // Mode and Request have meaningful defaults, so a step saved without them (API, templates) still publishes.
    expect(step.definition.configSchema.filter((f) => f.required).map((f) => f.key)).toEqual(['workflowId', 'saveAs']);
  });
});
