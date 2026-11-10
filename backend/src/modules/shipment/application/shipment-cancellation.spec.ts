import { ShipmentService } from './shipment.service';
import { ShipmentCancellationService } from './shipment-cancellation.service';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../testing/shipment-fakes';
import { InvalidOperationError, UpstreamError, RetryableError } from '../../../shared/domain/errors';
import { CourierGateway } from '../../courier/application/courier-gateway';
import { CourierRegistry } from '../../courier/application/courier-registry';
import { CourierRejectedError, CourierUnavailableError } from '../../courier/domain/courier-provider';
import { ShipmentCancelNode } from '../../nodes/implementations/logistics/shipment-cancel.node';
import type { NodeExecutionContext } from '../../nodes/domain/workflow-node.types';

describe('ShipmentCancellationService', () => {
  let repo: InMemoryShipments;
  let events: RecordingPublisher;
  let shipments: ShipmentService;
  let gateway: { cancelShipment: jest.Mock };
  let cancellation: ShipmentCancellationService;
  let input: ReturnType<typeof shipmentInput>;

  beforeEach(async () => {
    const { service: warehouses, delhi } = await warehouseFixture();
    input = shipmentInput(delhi.id);
    repo = new InMemoryShipments();
    events = new RecordingPublisher();
    shipments = new ShipmentService(repo, events, warehouses);
    gateway = { cancelShipment: jest.fn(async () => ({ cancelled: true })) };
    const registry = {
      has: () => true,
      get: (code: string) => ({ enabled: true, provider: { code, name: code.toUpperCase() } }),
    } as unknown as CourierRegistry;
    cancellation = new ShipmentCancellationService(shipments, gateway as unknown as CourierGateway, registry);
  });

  const booked = async () => {
    const s = await shipments.create('t', input, { triggered: true });
    return shipments.assignCourier('t', s.id, { courier: 'ekart', awb: 'EK1', labelUrl: 'x' }, 'test');
  };

  it('cancels an unbooked shipment without calling a courier and emits shipment.cancelled with the reason', async () => {
    const s = await shipments.create('t', input); // awaiting trigger
    const cancelled = await cancellation.cancel('t', s.id, 'Customer changed mind', 'manual');
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellation: { reason: 'Customer changed mind', source: 'manual', courierCancelled: false } });
    expect(gateway.cancelShipment).not.toHaveBeenCalled();
    expect(events.events.at(-1)).toMatchObject({ name: 'shipment.cancelled', payload: { reason: 'Customer changed mind' } });
  });

  it('cancels the courier booking first, then the shipment', async () => {
    const s = await booked();
    const cancelled = await cancellation.cancel('t', s.id, 'Duplicate order', 'manual');
    expect(gateway.cancelShipment).toHaveBeenCalledWith('ekart', 'EK1');
    expect(cancelled.cancellation!.courierCancelled).toBe(true);
    expect(cancelled.events.at(-1)).toMatchObject({ status: 'cancelled', note: 'Duplicate order' });
  });

  it('leaves the shipment untouched when the courier refuses or is down', async () => {
    const s = await booked();
    gateway.cancelShipment.mockRejectedValueOnce(new CourierRejectedError('ekart', 'already manifested'));
    await expect(cancellation.cancel('t', s.id, 'x reason', 'manual')).rejects.toThrow('EKART refused to cancel EK1');
    gateway.cancelShipment.mockRejectedValue(new CourierUnavailableError('ekart', '503'));
    await expect(cancellation.cancel('t', s.id, 'x reason', 'manual')).rejects.toBeInstanceOf(UpstreamError);
    expect((await shipments.get('t', s.id)).status).toBe('assigned');
    expect(events.events.some((e) => e.name === 'shipment.cancelled')).toBe(false);
  });

  it('refuses once the parcel is picked up, and refuses a second cancel', async () => {
    const s = await booked();
    await shipments.applyStatus('t', s.id, 'picked_up', 'test');
    await expect(cancellation.cancel('t', s.id, 'too late', 'manual')).rejects.toThrow('Initiate an RTO');
    const other = await shipments.create('t', input, { triggered: true });
    await cancellation.cancel('t', other.id, 'first', 'manual');
    await expect(cancellation.cancel('t', other.id, 'second', 'manual')).rejects.toBeInstanceOf(InvalidOperationError);
  });

  it('the workflow node uses the same path and asks the queue to retry courier outages', async () => {
    const node = new ShipmentCancelNode(cancellation);
    const s = await booked();
    const ctx = (shipment: unknown) =>
      ({
        tenantId: 't',
        executionId: 'ex1',
        config: { reason: 'Risky order {{shipment.orderId}}' },
        data: { shipment, context: {}, trigger: { event: 'shipment.created', data: {} } },
      }) as unknown as NodeExecutionContext;

    gateway.cancelShipment.mockRejectedValue(new CourierUnavailableError('ekart', '503'));
    await expect(node.execute(ctx(s))).rejects.toBeInstanceOf(RetryableError);

    gateway.cancelShipment.mockResolvedValue({ cancelled: true });
    const result = await node.execute(ctx(s));
    expect(result.output).toMatchObject({ reason: 'Risky order ORD-1', courierCancelled: true });
    expect((await shipments.get('t', s.id)).cancellation).toMatchObject({ source: 'workflow:ex1' });
  });
});
