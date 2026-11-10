import { ExecutionEngine } from '../../../execution/application/execution-engine';
import { InlineStepScheduler } from '../../../execution/application/inline-step.scheduler';
import { SyncExecutionRunner } from '../../../execution/application/sync-execution.runner';
import { ShipmentScopeLoader } from '../../../execution/infrastructure/shipment-scope.loader';
import { NodeRegistry } from '../../node-registry';
import { NodeResolver } from '../../node-resolver';
import { TriggerHttpNode } from '../trigger/trigger-http.node';
import { HttpResponseNode } from '../response/http-response.node';
import { DataQueryNode } from '../data/data-query.node';
import { DataInsertNode } from '../data/data-insert.node';
import { ShipmentTagNode } from './shipment-tag.node';
import { ShipmentUseNode } from './shipment-use.node';
import { ShipmentService } from '../../../shipment/application/shipment.service';
import { ShipmentsDataSource } from '../../../shipment/application/shipments.data-source';
import { WORKFLOW_TEMPLATES } from '../../../workflow/application/workflow-templates';
import { httpTrigger } from '../../domain/triggers';
import { InMemoryExecutions } from '../../../../testing/execution-fakes';
import { inMemoryDataService } from '../../../../testing/data-fakes';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../../testing/shipment-fakes';
import type { CustomNodeService } from '../../../custom-node/application/custom-node.service';
import type { CodeSandbox } from '../../../custom-node/application/code-sandbox.ports';
import type { EventDefinitionService } from '../../../custom-event/application/event-definition.service';
import type { WorkflowDefinition } from '../../../workflow/domain/workflow-definition.types';
import type { HttpRequestData } from '../../domain/workflow-node.types';

const request = (path: string, params: Record<string, string> = {}, query: Record<string, unknown> = {}): HttpRequestData => ({
  method: 'GET',
  path,
  params,
  query,
  headers: {},
  body: null,
  auth: null,
});

const templateDefinition = (id: string) => WORKFLOW_TEMPLATES.find((t) => t.id === id)!.definition;

describe('Use shipment in API workflows', () => {
  let runner: SyncExecutionRunner;
  let executions: InMemoryExecutions;
  let shipments: ShipmentService;
  let ownId: string;

  beforeEach(async () => {
    const { service: warehouses, delhi } = await warehouseFixture();
    const repo = new InMemoryShipments();
    shipments = new ShipmentService(repo, new RecordingPublisher(), warehouses);
    const own = await shipments.create('t', shipmentInput(delhi.id, { orderId: 'ORD-7', orderValue: 2500 }));
    ownId = own.id;
    await repo.update('t', own.id, { status: 'in_transit', courier: 'delhivery', awb: 'AWB-OWN' });
    const foreign = await shipments.create('other', shipmentInput(delhi.id, { orderId: 'ORD-X' }));
    await repo.update('other', foreign.id, { awb: 'AWB-FOREIGN' });

    const data = inMemoryDataService([new ShipmentsDataSource(repo)]);
    const registry = new NodeRegistry([
      new TriggerHttpNode(),
      new ShipmentUseNode(shipments),
      new ShipmentTagNode(shipments),
      new DataQueryNode(data.service, data.sources),
      new DataInsertNode(data.service, data.sources),
      new HttpResponseNode(),
    ]);
    const resolver = new NodeResolver(registry, {} as CustomNodeService, {} as CodeSandbox, {} as EventDefinitionService);
    executions = new InMemoryExecutions();
    const engine = new ExecutionEngine(executions, new InlineStepScheduler(), resolver, new ShipmentScopeLoader(shipments));
    runner = new SyncExecutionRunner(engine, executions);
  });

  const call = (definition: WorkflowDefinition, req: HttpRequestData) =>
    runner.run(
      { tenantId: 't', workflowId: 'wf', workflowName: 'API', workflowVersion: 1, definition, trigger: httpTrigger(req, { endpoint: null }), shipmentId: null, mode: 'api' },
      { timeoutMs: 5_000 },
    );

  it('order tracking template: finds the shipment by order id and returns its tracking', async () => {
    const result = await call(templateDefinition('api-track-order'), request('/orders/ORD-7/tracking', { orderId: 'ORD-7' }));
    expect(result).toMatchObject({
      kind: 'response',
      response: { statusCode: 200, body: { orderId: 'ORD-7', status: 'in_transit', courier: 'delhivery', awb: 'AWB-OWN', events: [expect.objectContaining({ status: 'new' })] } },
    });
    // The run now belongs to the shipment, so it shows in the shipment's history.
    expect(executions.executions.get(result.executionId)!.shipmentId).toBe(ownId);
  });

  it('order tracking template: 404 for an unknown order', async () => {
    const result = await call(templateDefinition('api-track-order'), request('/orders/NOPE/tracking', { orderId: 'NOPE' }));
    expect(result).toMatchObject({ kind: 'response', response: { statusCode: 404, body: { error: 'No shipment for this order', orderId: 'NOPE' } } });
  });

  it('list shipments template: filters built-in shipments by the query string', async () => {
    const result = await call(templateDefinition('api-list-shipments'), request('/shipments', {}, { status: 'in_transit' }));
    expect(result).toMatchObject({ kind: 'response', response: { statusCode: 200, body: { items: [expect.objectContaining({ orderId: 'ORD-7' })] } } });
  });

  it('later shipment steps act on the attached shipment; AWBs of other accounts are not found', async () => {
    const definition: WorkflowDefinition = {
      nodes: [
        { id: 'trg', type: 'trigger.http', name: 'API', position: { x: 0, y: 0 }, config: {} },
        { id: 'use', type: 'shipment.use', name: 'Use', position: { x: 1, y: 0 }, config: { by: 'awb', value: '{{request.params.awb}}' } },
        { id: 'tag', type: 'shipment.tag', name: 'Tag', position: { x: 2, y: 0 }, config: { tags: 'api-touched' } },
        { id: 'ok', type: 'http.response', name: 'OK', position: { x: 3, y: 0 }, config: { statusCode: 200, body: { id: '{{shipment.id}}', tags: '{{shipment.tags}}' } } },
        { id: 'nf', type: 'http.response', name: '404', position: { x: 2, y: 1 }, config: { statusCode: 404, body: {} } },
      ],
      edges: [
        { id: 'e1', source: 'trg', sourceHandle: 'default', target: 'use' },
        { id: 'e2', source: 'use', sourceHandle: 'found', target: 'tag' },
        { id: 'e3', source: 'tag', sourceHandle: 'default', target: 'ok' },
        { id: 'e4', source: 'use', sourceHandle: 'not_found', target: 'nf' },
      ],
    };
    expect(await call(definition, request('/x', { awb: 'AWB-OWN' }))).toMatchObject({ response: { statusCode: 200, body: { id: ownId, tags: ['api-touched'] } } });
    expect((await shipments.get('t', ownId)).tags).toEqual(['api-touched']);
    expect(await call(definition, request('/x', { awb: 'AWB-FOREIGN' }))).toMatchObject({ response: { statusCode: 404 } });
  });

  it('write steps refuse built-in data; read steps accept it', () => {
    const insert = new DataInsertNode({} as never, { hasSystemSource: () => true } as never);
    expect(insert.validateConfig({ collection: 'system.shipments', record: '{}' })).toEqual([expect.stringContaining('read-only here')]);
    const query = new DataQueryNode({} as never, { hasSystemSource: (n: string) => n === 'system.shipments' } as never);
    expect(query.validateConfig({ collection: 'system.shipments' })).toEqual([]);
    expect(query.validateConfig({ collection: 'system.nope' })).toEqual([expect.stringContaining('not built-in data')]);
  });
});
