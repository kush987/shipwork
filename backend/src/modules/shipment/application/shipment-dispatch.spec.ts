import { ShipmentService } from './shipment.service';
import { ShipmentBookingService } from './shipment-booking.service';
import { ShipmentDispatchService } from './shipment-dispatch.service';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../testing/shipment-fakes';
import { InvalidOperationError } from '../../../shared/domain/errors';
import { CourierGateway } from '../../courier/application/courier-gateway';
import { CourierRegistry } from '../../courier/application/courier-registry';
import { CourierRejectedError, CourierUnavailableError } from '../../courier/domain/courier-provider';

describe('ShipmentDispatchService', () => {
  let repo: InMemoryShipments;
  let events: RecordingPublisher;
  let gateway: { createShipment: jest.Mock; cancelShipment: jest.Mock; checkServiceability: jest.Mock };
  let dispatch: ShipmentDispatchService;
  let input: ReturnType<typeof shipmentInput>;

  beforeEach(async () => {
    const { service: warehouses, delhi } = await warehouseFixture();
    input = shipmentInput(delhi.id, { paymentMode: 'PREPAID', codAmount: 0, items: [] });
    repo = new InMemoryShipments();
    events = new RecordingPublisher();
    const shipments = new ShipmentService(repo, events, warehouses);
    gateway = {
      createShipment: jest.fn(async (_t, courierCode: string, parcel: { reference: string }) => ({
        awb: `${courierCode}-${parcel.reference}`,
        courierCode,
        labelUrl: 'x',
        reference: parcel.reference,
        replayed: false,
      })),
      cancelShipment: jest.fn(),
      checkServiceability: jest.fn(async (_p, codes: string[]) => codes.map((c) => ({ courierCode: c, serviceable: true }))),
    };
    const registry = {
      get: (code: string) => ({ enabled: true, provider: { code, name: code.toUpperCase() } }),
    } as unknown as CourierRegistry;
    const booking = new ShipmentBookingService(shipments, gateway as unknown as CourierGateway, registry, warehouses);
    dispatch = new ShipmentDispatchService(shipments, booking, registry);
  });

  const names = () => events.events.map((e) => e.name);

  it('auto mode triggers right away and hands the shipment to workflows', async () => {
    const s = await dispatch.create('t', input);
    expect(s.triggeredAt).not.toBeNull();
    expect(names()).toEqual(['shipment.created']);
    expect(gateway.createShipment).not.toHaveBeenCalled();
  });

  it('manual mode waits for a trigger, then books the chosen courier', async () => {
    const s = await dispatch.create('t', input, { mode: 'manual', courier: 'ekart' });
    expect(s).toMatchObject({ status: 'new', triggeredAt: null, dispatch: { mode: 'manual', courier: 'ekart' } });
    expect(names()).toEqual([]);

    const triggered = await dispatch.trigger('t', s.id, 'manual');
    expect(triggered).toMatchObject({ status: 'assigned', courier: 'ekart' });
    expect(triggered.events.map((e) => e.status)).toEqual(['new', 'triggered', 'assigned']);
    // Booked first, then announced, so the usual "Shipment created" workflows run too.
    expect(names()).toEqual(['shipment.assigned', 'shipment.created']);
    expect((events.events[1].payload as { shipment: { awb: string } }).shipment.awb).toBeTruthy();
  });

  it('refuses to trigger the same shipment twice', async () => {
    const s = await dispatch.create('t', input, { mode: 'manual', courier: 'ekart' });
    await dispatch.trigger('t', s.id, 'manual');
    await expect(dispatch.trigger('t', s.id, 'manual')).rejects.toThrow('already triggered');
    expect(gateway.createShipment).toHaveBeenCalledTimes(1);
  });

  it('puts the shipment back to awaiting trigger when the booking fails', async () => {
    const s = await dispatch.create('t', input, { mode: 'manual', courier: 'ekart' });
    gateway.createShipment.mockRejectedValueOnce(new CourierRejectedError('ekart', 'pincode not covered'));
    await expect(dispatch.trigger('t', s.id, 'manual')).rejects.toBeInstanceOf(InvalidOperationError);
    const after = repo.rows.get(s.id)!;
    expect(after).toMatchObject({ status: 'new', triggeredAt: null, awb: null });
    expect(after.events.at(-1)).toMatchObject({ status: 'trigger_failed' });
  });

  it('retries a brief courier outage on trigger instead of failing', async () => {
    const s = await dispatch.create('t', input, { mode: 'manual', courier: 'ekart' });
    gateway.createShipment.mockRejectedValueOnce(new CourierUnavailableError('ekart', '503'));
    const triggered = await dispatch.trigger('t', s.id, 'manual');
    expect(triggered.status).toBe('assigned');
    expect(gateway.createShipment).toHaveBeenCalledTimes(2);
    expect(gateway.createShipment.mock.calls[0][3]).toBe(gateway.createShipment.mock.calls[1][3]);
  });

  it('rejects a manual courier that cannot take the parcel', async () => {
    gateway.checkServiceability.mockResolvedValueOnce([{ courierCode: 'bluedart', serviceable: false, reason: 'Weight above 20kg limit' }]);
    await expect(dispatch.create('t', input, { mode: 'manual', courier: 'bluedart' })).rejects.toThrow('Weight above 20kg limit');
    expect(repo.rows.size).toBe(0);
  });

  it('bulk trigger processes each shipment independently', async () => {
    const a = await dispatch.create('t', { ...input, orderId: 'A' }, { mode: 'manual', courier: 'ekart' });
    const b = await dispatch.create('t', { ...input, orderId: 'B' }, { mode: 'manual', courier: 'delhivery' });
    const c = await dispatch.create('t', { ...input, orderId: 'C' }, { mode: 'manual', courier: 'xpressbees' });
    gateway.createShipment.mockImplementation(async (_t, courierCode: string, parcel: { reference: string }) => {
      if (courierCode === 'delhivery') throw new CourierRejectedError('delhivery', 'rejected');
      return { awb: `${courierCode}-1`, courierCode, labelUrl: 'x', reference: parcel.reference, replayed: false };
    });

    const result = await dispatch.bulkTrigger('t', [a.id, b.id, c.id, a.id, 'shp_missing']);
    expect(result).toMatchObject({ total: 4, succeeded: 2, failed: 2 });
    expect(result.results.find((r) => r.id === b.id)).toMatchObject({ ok: false, orderId: 'B' });
    expect(result.results.find((r) => r.id === 'shp_missing')).toMatchObject({ ok: false, orderId: null });
    expect(repo.rows.get(a.id)!.status).toBe('assigned');
    expect(repo.rows.get(b.id)!.triggeredAt).toBeNull();
    expect(repo.rows.get(c.id)!.status).toBe('assigned');
  });

  it('only lets pending shipments change their selected courier', async () => {
    const s = await dispatch.create('t', input, { mode: 'manual', courier: 'ekart' });
    expect((await dispatch.selectCourier('t', s.id, 'delhivery')).dispatch.courier).toBe('delhivery');
    await dispatch.trigger('t', s.id, 'manual');
    await expect(dispatch.selectCourier('t', s.id, 'ekart')).rejects.toBeInstanceOf(InvalidOperationError);
  });
});
