import { EventDefinitionService } from './event-definition.service';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { InMemoryEventDefinitions, InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../testing/shipment-fakes';
import { InvalidOperationError, NotFoundError, ValidationFailedError, NonRetryableError } from '../../../shared/domain/errors';
import { EmitEventNode } from '../../nodes/implementations/flow/emit-event.node';
import type { NodeExecutionContext } from '../../nodes/domain/workflow-node.types';

describe('EventDefinitionService', () => {
  let events: RecordingPublisher;
  let shipments: ShipmentService;
  let service: EventDefinitionService;
  let shipmentId: string;

  beforeEach(async () => {
    const { service: warehouses, delhi } = await warehouseFixture();
    events = new RecordingPublisher();
    shipments = new ShipmentService(new InMemoryShipments(), events, warehouses);
    shipmentId = (await shipments.create('t', shipmentInput(delhi.id), { triggered: true })).id;
    service = new EventDefinitionService(new InMemoryEventDefinitions(), shipments, events);
  });

  const paymentFailed = () =>
    service.create('t', {
      label: 'Payment failed',
      description: 'Gateway declined the prepaid payment',
      payloadSchema: [
        { key: 'amount', label: 'Amount', kind: 'number', required: true },
        { key: 'retryable', label: 'Retryable', kind: 'boolean' },
      ],
    });

  it('derives a custom.<slug> key and refuses duplicates', async () => {
    expect((await paymentFailed()).key).toBe('custom.payment_failed');
    await expect(paymentFailed()).rejects.toBeInstanceOf(InvalidOperationError);
    expect((await service.create('t', { label: 'Anything', description: '', payloadSchema: [], slug: 'vip-flagged' })).key).toBe('custom.vip-flagged');
  });

  it('lists custom events in the trigger catalog next to the built-in ones', async () => {
    await paymentFailed();
    const catalog = await service.catalog('t');
    expect(catalog.find((e) => e.value === 'shipment.created')).toMatchObject({ custom: false });
    expect(catalog.find((e) => e.value === 'custom.payment_failed')).toMatchObject({ custom: true, label: 'Payment failed' });
  });

  it('emits: coerces the payload, records it on the shipment and publishes it', async () => {
    await paymentFailed();
    const sent = await service.emit('t', { event: 'custom.payment_failed', shipmentId, payload: { amount: '1499', retryable: 'true', extra: 'kept' } }, 'api');
    expect(sent.payload).toEqual({ amount: 1499, retryable: true, extra: 'kept' });
    expect(events.events.at(-1)).toMatchObject({ name: 'custom.payment_failed', payload: { payload: { amount: 1499 }, source: 'api', chainDepth: 0 } });
    expect((await shipments.get('t', shipmentId)).events.at(-1)).toMatchObject({ status: 'custom.payment_failed', note: 'amount: 1499 · retryable: true · extra: kept' });
  });

  it('finds the shipment by order id', async () => {
    await paymentFailed();
    expect((await service.emit('t', { event: 'custom.payment_failed', orderId: 'ORD-1', payload: { amount: 1 } }, 'api')).shipmentId).toBe(shipmentId);
    await expect(service.emit('t', { event: 'custom.payment_failed', orderId: 'NOPE', payload: { amount: 1 } }, 'api')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects bad payloads, built-in, unknown and archived events', async () => {
    const def = await paymentFailed();
    await expect(service.emit('t', { event: 'custom.payment_failed', shipmentId, payload: {} }, 'api')).rejects.toBeInstanceOf(ValidationFailedError);
    await expect(service.emit('t', { event: 'custom.payment_failed', shipmentId, payload: { amount: 'abc' } }, 'api')).rejects.toThrow(ValidationFailedError);
    await expect(service.emit('t', { event: 'shipment.delivered', shipmentId }, 'api')).rejects.toThrow('built-in');
    await expect(service.emit('t', { event: 'custom.nope', shipmentId }, 'api')).rejects.toBeInstanceOf(NotFoundError);
    await service.setArchived('t', def.id, true);
    await expect(service.emit('t', { event: 'custom.payment_failed', shipmentId, payload: { amount: 1 } }, 'api')).rejects.toThrow('archived');
    expect(await service.exists('t', 'custom.payment_failed')).toBe(false);
    expect(await service.exists('t', 'shipment.ndr')).toBe(true);
  });

  it('stops event chains that go too deep', async () => {
    await paymentFailed();
    await expect(service.emit('t', { event: 'custom.payment_failed', shipmentId, payload: { amount: 1 } }, 'workflow:x', 6)).rejects.toThrow('prevent a loop');
  });

  it('the Emit event node renders the payload and passes chain depth + 1', async () => {
    await paymentFailed();
    const node = new EmitEventNode(service);
    const shipment = await shipments.get('t', shipmentId);
    const ctx = (depth: number) =>
      ({
        tenantId: 't',
        executionId: 'ex1',
        config: { event: 'custom.payment_failed', payload: '{"amount": "{{shipment.orderValue}}"}' },
        data: { shipment, context: {}, trigger: { event: 'custom.x', data: { chainDepth: depth } } },
      }) as unknown as NodeExecutionContext;
    const result = await node.execute(ctx(2));
    expect(result.output).toMatchObject({ payload: { amount: 1000 }, chainDepth: 3 });
    expect(events.events.at(-1)).toMatchObject({ payload: { chainDepth: 3, source: 'workflow:ex1' } });
    await expect(node.execute(ctx(5))).rejects.toBeInstanceOf(NonRetryableError);
    expect(node.validateConfig({ event: 'shipment.delivered' })).toEqual(['Only custom events can be emitted']);
  });
});
