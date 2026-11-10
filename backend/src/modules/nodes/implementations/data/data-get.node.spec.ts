import { Logger } from '@nestjs/common';
import { DataGetNode } from './data-get.node';
import { inMemoryDataService } from '../../../../testing/data-fakes';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../../testing/shipment-fakes';
import { ShipmentService } from '../../../shipment/application/shipment.service';
import { ShipmentsDataSource } from '../../../shipment/application/shipments.data-source';
import { toWorkflowRequest } from '../../domain/triggers';
import { NonRetryableError } from '../../../../shared/domain/errors';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';

const ctx = (config: Record<string, unknown>, request: { params?: Record<string, string>; body?: unknown } = {}): NodeExecutionContext => ({
  tenantId: 't',
  executionId: 'ex',
  nodeId: 'n',
  idempotencyKey: 'ex:n',
  attempt: 1,
  isFinalAttempt: true,
  config,
  data: {
    trigger: { event: 'http.request', data: {} },
    context: {},
    request: toWorkflowRequest({ method: 'get', path: '/x', params: request.params ?? {}, body: request.body ?? null }),
    shipment: null,
  },
  logger: new Logger('test'),
});

describe('Get record', () => {
  const setup = async () => {
    const { service: warehouses, delhi } = await warehouseFixture();
    const repo = new InMemoryShipments();
    const shipments = new ShipmentService(repo, new RecordingPublisher(), warehouses);
    await shipments.create('t', shipmentInput(delhi.id, { orderId: 'ORD-1', orderValue: 900 }));
    const { service, sources } = inMemoryDataService([new ShipmentsDataSource(repo)]);
    await service.seedSamples('t'); // products: KUR-001 (1299), DUP-004 (2499), SAR-010 (7999)
    return { service, node: new DataGetNode(service, sources) };
  };

  it('still finds by id when "Find by" is unset (steps saved before it existed)', async () => {
    const { service, node } = await setup();
    const [kurta] = await service.findRecords('t', 'products', { filter: { sku: 'KUR-001' } });
    const found = await node.execute(ctx({ collection: 'products', id: '{{request.params.id}}' }, { params: { id: kurta.id } }));
    expect(found).toMatchObject({ outputHandle: 'found', contextPatch: { record: { sku: 'KUR-001' } }, output: { id: kurta.id } });
    const missing = await node.execute(ctx({ collection: 'products', findBy: 'id', id: 'rec_nope' }));
    expect(missing).toMatchObject({ outputHandle: 'not_found', output: { id: 'rec_nope', found: false } });
  });

  it('finds by any field and saves the record under "Save result as"', async () => {
    const { node } = await setup();
    const result = await node.execute(ctx({ collection: 'products', findBy: 'sku', id: '{{request.params.sku}}', saveAs: 'product' }, { params: { sku: 'DUP-004' } }));
    expect(result.outputHandle).toBe('found');
    expect(result.contextPatch).toEqual({ product: expect.objectContaining({ sku: 'DUP-004', name: 'Silk dupatta' }) });
    expect(result.output).toMatchObject({ findBy: 'sku', value: 'DUP-004', savedAs: 'context.product' });
    expect(result.output).not.toHaveProperty('multipleMatches');
  });

  it('reads text from a URL as the field’s declared type', async () => {
    const { node } = await setup();
    const result = await node.execute(ctx({ collection: 'products', findBy: 'price', id: '{{request.params.price}}' }, { params: { price: '7999' } }));
    expect(result).toMatchObject({ outputHandle: 'found', contextPatch: { record: { sku: 'SAR-010' } } });
  });

  it('takes the newest of several matches and says so', async () => {
    const { service, node } = await setup();
    await service.createRecord('t', 'products', { sku: 'KUR-002', name: 'Cotton kurta', price: 1399, stock: 5 });
    const result = await node.execute(ctx({ collection: 'products', findBy: 'name', id: 'Cotton kurta' }));
    expect(result).toMatchObject({ outputHandle: 'found', contextPatch: { record: { sku: 'KUR-002' } }, output: { multipleMatches: true } });
  });

  it('goes to Not found when nothing matches', async () => {
    const { node } = await setup();
    const result = await node.execute(ctx({ collection: 'products', findBy: 'sku', id: 'NOPE-1' }));
    expect(result).toMatchObject({ outputHandle: 'not_found', output: { findBy: 'sku', value: 'NOPE-1', found: false } });
  });

  it('finds built-in data by its declared fields', async () => {
    const { node } = await setup();
    const result = await node.execute(ctx({ collection: 'system.shipments', findBy: 'orderId', id: 'ORD-1' }));
    expect(result).toMatchObject({ outputHandle: 'found', contextPatch: { record: { orderId: 'ORD-1', orderValue: 900 } } });
  });

  it('never lets a request value act as a filter operator', async () => {
    const { node } = await setup();
    const injected = node.execute(ctx({ collection: 'products', findBy: 'sku', id: '{{request.body.sku}}' }, { body: { sku: { $ne: null } } }));
    await expect(injected).rejects.toThrow(NonRetryableError);
    await expect(injected).rejects.toThrow('must be text, a number or true/false — got an object');
    const empty = node.execute(ctx({ collection: 'products', findBy: 'sku', id: '{{request.body.sku}}' }, { body: {} }));
    await expect(empty).rejects.toThrow('Value to find by “sku” is empty');
  });

  it('checks "Find by" before publishing: a field name, and one built-in data has', async () => {
    const { node } = await setup();
    expect(node.validateConfig({ collection: 'products', findBy: 'anything_goes', id: 'x' })).toEqual([]);
    expect(node.validateConfig({ collection: 'products', findBy: 'sku; drop', id: 'x' })[0]).toContain('must be a field name');
    expect(node.validateConfig({ collection: 'system.shipments', findBy: 'awb', id: 'x' })).toEqual([]);
    expect(node.validateConfig({ collection: 'system.shipments', findBy: 'secret', id: 'x' })[0]).toMatch(/^Shipments has no field “secret” — use id, orderId/);
  });
});
