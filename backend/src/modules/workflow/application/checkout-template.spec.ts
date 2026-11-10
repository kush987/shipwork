import { ExecutionEngine } from '../../execution/application/execution-engine';
import { InlineStepScheduler } from '../../execution/application/inline-step.scheduler';
import { SyncExecutionRunner } from '../../execution/application/sync-execution.runner';
import { WorkflowCallService } from '../../execution/application/workflow-call.service';
import { NodeRegistry } from '../../nodes/node-registry';
import { NodeResolver } from '../../nodes/node-resolver';
import { TriggerHttpNode } from '../../nodes/implementations/trigger/trigger-http.node';
import { HttpResponseNode } from '../../nodes/implementations/response/http-response.node';
import { RunCodeNode } from '../../nodes/implementations/transform/run-code.node';
import { ConditionNode } from '../../nodes/implementations/logic/condition.node';
import { DataGetNode } from '../../nodes/implementations/data/data-get.node';
import { DataInsertNode } from '../../nodes/implementations/data/data-insert.node';
import { DataUpdateNode } from '../../nodes/implementations/data/data-update.node';
import { RunWorkflowNode } from '../../nodes/implementations/flow/run-workflow.node';
import { WorkflowCalls } from '../../nodes/domain/workflow-caller';
import { httpTrigger, toWorkflowRequest } from '../../nodes/domain/triggers';
import { QuickJsSandbox } from '../../custom-node/infrastructure/quickjs-sandbox';
import { FixedScope, InMemoryExecutions } from '../../../testing/execution-fakes';
import { inMemoryDataService } from '../../../testing/data-fakes';
import { NotFoundError } from '../../../shared/domain/errors';
import { WORKFLOW_TEMPLATES } from './workflow-templates';
import { withPartIds } from './workflow-templates.helpers';
import type { CustomNodeService } from '../../custom-node/application/custom-node.service';
import type { EventDefinitionService } from '../../custom-event/application/event-definition.service';
import type { WorkflowService } from './workflow.service';
import type { WorkflowDefinition } from '../domain/workflow-definition.types';

const checkout = WORKFLOW_TEMPLATES.find((t) => t.id === 'api-checkout')!;
const PARTS = checkout.parts!.map((p) => ({ key: p.key, id: `wf-${p.key}`, name: `Checkout · ${p.name}` }));

describe('Checkout API template', () => {
  let data: ReturnType<typeof inMemoryDataService>;
  let runner: SyncExecutionRunner;
  let products: Record<string, { id: string; stock: number }>;

  beforeEach(async () => {
    data = inMemoryDataService();
    await data.service.seedSamples('t');
    products = Object.fromEntries((await data.service.findRecords('t', 'products', { limit: 10 })).map((p) => [p.sku as string, { id: p.id, stock: p.stock as number }]));

    const sandbox = new QuickJsSandbox();
    const calls = new WorkflowCalls();
    const registry = new NodeRegistry([
      new TriggerHttpNode(),
      new HttpResponseNode(),
      new RunCodeNode(sandbox),
      new ConditionNode(sandbox),
      new DataGetNode(data.service, data.sources),
      new DataInsertNode(data.service, data.sources),
      new DataUpdateNode(data.service, data.sources),
      new RunWorkflowNode(calls),
    ]);
    const executions = new InMemoryExecutions();
    const engine = new ExecutionEngine(executions, new InlineStepScheduler(), new NodeResolver(registry, {} as CustomNodeService, sandbox, {} as EventDefinitionService), new FixedScope());
    runner = new SyncExecutionRunner(engine, executions);
    // The parts as published workflows, the way the template creates them.
    const published: Record<string, { name: string; definition: WorkflowDefinition }> = Object.fromEntries(
      checkout.parts!.map((p, i) => [PARTS[i].id, { name: PARTS[i].name, definition: p.definition }]),
    );
    const workflows = {
      resolvePublished: async (_: string, id: string) => {
        const w = published[id];
        if (!w) throw new NotFoundError('Workflow', id);
        return { workflow: { toJSON: () => ({ id, name: w.name, triggerEvent: 'http.request' }) }, version: { version: 1, definition: w.definition } };
      },
    } as unknown as WorkflowService;
    new WorkflowCallService(workflows, engine, runner, executions, calls).onModuleInit();
  });

  const post = async (body: Record<string, unknown>) => {
    const run = await runner.run(
      {
        tenantId: 't',
        workflowId: 'wf-checkout',
        workflowName: 'Checkout',
        workflowVersion: 1,
        definition: withPartIds(structuredClone(checkout.definition), PARTS),
        trigger: httpTrigger(toWorkflowRequest({ method: 'POST', path: '/checkout', body }), {}),
        shipmentId: null,
        mode: 'api',
      },
      { timeoutMs: 5000 },
    );
    if (run.kind !== 'response') throw new Error(`no response: ${JSON.stringify(run)}`);
    return run.response;
  };
  const stockOf = async (sku: string) => (await data.service.getRecord('t', 'products', products[sku].id))!.stock;

  it('prices the order, reserves stock, saves the order and answers 201', async () => {
    const res = await post({ customerId: 'c1', productId: products['DUP-004'].id, quantity: 3 }); // 3 × ₹2,499 = ₹7,497 → 10% off
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ total: 6747.3, discountPct: 10, stockLeft: products['DUP-004'].stock - 3, status: 'CREATED' });
    expect(await stockOf('DUP-004')).toBe(products['DUP-004'].stock - 3);
    const [order] = await data.service.findRecords('t', 'orders', {});
    expect(order).toMatchObject({ id: (res.body as { orderId: string }).orderId, customerId: 'c1', quantity: 3, total: 6747.3, status: 'CREATED' });
  });

  it('answers 409 with what is available when stock is short, and changes nothing', async () => {
    const res = await post({ customerId: 'c1', productId: products['SAR-010'].id, quantity: 99 });
    expect(res).toMatchObject({ statusCode: 409, body: { error: 'Insufficient stock', available: products['SAR-010'].stock } });
    expect(await stockOf('SAR-010')).toBe(products['SAR-010'].stock);
    expect(await data.service.findRecords('t', 'orders', {})).toEqual([]);
  });

  it('answers 404 for an unknown product', async () => {
    expect(await post({ customerId: 'c1', productId: 'rec_nope', quantity: 1 })).toMatchObject({ statusCode: 404, body: { error: 'Product not found', productId: 'rec_nope' } });
  });

  it('answers 502 when a part can’t be run', async () => {
    const res = await runner.run(
      {
        tenantId: 't',
        workflowId: 'wf-checkout',
        workflowName: 'Checkout',
        workflowVersion: 1,
        definition: withPartIds(structuredClone(checkout.definition), [{ ...PARTS[0], id: 'wf-gone' }, PARTS[1]]),
        trigger: httpTrigger(toWorkflowRequest({ method: 'POST', path: '/checkout', body: { productId: products['KUR-001'].id, quantity: 1 } }), {}),
        shipmentId: null,
        mode: 'api',
      },
      { timeoutMs: 5000 },
    );
    expect(res).toMatchObject({ kind: 'response', response: { statusCode: 502, body: { error: expect.stringContaining('wf-gone') } } });
  });
});
