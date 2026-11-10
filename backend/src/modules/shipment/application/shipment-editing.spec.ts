import { ShipmentService } from './shipment.service';
import { ShipmentBookingService } from './shipment-booking.service';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../testing/shipment-fakes';
import type { WarehouseService } from '../../warehouse/application/warehouse.service';
import { InvalidOperationError, UpstreamError } from '../../../shared/domain/errors';
import { CourierGateway } from '../../courier/application/courier-gateway';
import { CourierRegistry } from '../../courier/application/courier-registry';
import { CourierUnavailableError } from '../../courier/domain/courier-provider';
import type { Warehouse } from '../../warehouse/domain/warehouse.types';

describe('Shipment editing and manual courier assignment', () => {
  let repo: InMemoryShipments;
  let events: RecordingPublisher;
  let service: ShipmentService;
  let gateway: { createShipment: jest.Mock; cancelShipment: jest.Mock };
  let booking: ShipmentBookingService;
  let warehouses: WarehouseService;
  let delhi: Warehouse;
  let mumbai: Warehouse;
  let input: ReturnType<typeof shipmentInput>;

  beforeEach(async () => {
    ({ service: warehouses, delhi, mumbai } = await warehouseFixture());
    input = shipmentInput(delhi.id);
    repo = new InMemoryShipments();
    events = new RecordingPublisher();
    service = new ShipmentService(repo, events, warehouses);
    gateway = {
      createShipment: jest.fn(async (_t, courierCode: string) => ({
        awb: `${courierCode.toUpperCase()}-AWB`,
        courierCode,
        labelUrl: 'x',
        reference: 'r',
        replayed: false,
      })),
      cancelShipment: jest.fn(async () => ({ cancelled: true })),
    };
    const registry = {
      get: (code: string) => ({ enabled: true, provider: { code, name: code[0].toUpperCase() + code.slice(1) } }),
    } as unknown as CourierRegistry;
    booking = new ShipmentBookingService(service, gateway as unknown as CourierGateway, registry, warehouses);
  });

  it('edits any field before a courier is booked and emits shipment.updated', async () => {
    const s = await service.create('t', input, { triggered: true });
    const shippingAddress = { line1: '7 Marine Drive', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' };
    const updated = await service.updateDetails('t', s.id, { weightKg: 2.5, shippingAddress }, 'manual');
    expect(updated).toMatchObject({ weightKg: 2.5, deliveryPincode: '400002', shippingAddress });
    expect(updated.events.at(-1)).toMatchObject({ status: 'updated', note: 'Changed weightKg, shippingAddress' });
    expect(events.events.at(-1)).toMatchObject({ name: 'shipment.updated', payload: { changed: ['weightKg', 'shippingAddress'] } });
  });

  it('derives pincodes and defaults billing to shipping and RTO to pickup', async () => {
    const s = await service.create('t', input);
    expect(s).toMatchObject({
      pickupPincode: '110020',
      deliveryPincode: '560001',
      billingAddress: input.shippingAddress,
      rtoWarehouseId: delhi.id,
      pickupAddress: { warehouseId: delhi.id, name: 'Delhi FC' },
      rtoAddress: { warehouseId: delhi.id },
    });
  });

  it('keeps a snapshot of the warehouse even if the warehouse is edited later', async () => {
    const s = await service.create('t', { ...input, rtoWarehouseId: mumbai.id });
    await warehouses.update('t', delhi.id, { name: 'Delhi FC (renamed)' });
    const after = await service.get('t', s.id);
    expect(after.pickupAddress!.name).toBe('Delhi FC');
    expect(after.rtoAddress!.name).toBe('Bhiwandi WH');
  });

  it('refuses deactivated warehouses for new shipments', async () => {
    await warehouses.update('t', mumbai.id, { isDefault: true });
    await warehouses.deactivate('t', delhi.id);
    await expect(service.create('t', input)).rejects.toThrow('deactivated');
  });

  it('moves the pickup pincode with the pickup warehouse before booking', async () => {
    const s = await service.create('t', input);
    const updated = await service.updateDetails('t', s.id, { pickupWarehouseId: mumbai.id }, 'manual');
    expect(updated).toMatchObject({ pickupPincode: '421302', pickupAddress: { name: 'Bhiwandi WH' } });
  });

  it('after booking: billing editable, same-pincode address fix allowed, other pincode or warehouse locked', async () => {
    const s = await service.create('t', input, { triggered: true });
    await booking.assign('t', s.id, 'ekart');
    const billingAddress = { line1: 'GST House', city: 'Bengaluru', state: 'Karnataka', pincode: '560002' };
    expect((await service.updateDetails('t', s.id, { billingAddress }, 'manual')).billingAddress).toEqual(billingAddress);
    const fixed = { ...input.shippingAddress, line2: 'Flat 4B', landmark: 'Near metro' };
    expect((await service.updateDetails('t', s.id, { shippingAddress: fixed }, 'manual')).shippingAddress).toEqual(fixed);
    await expect(
      service.updateDetails('t', s.id, { shippingAddress: { ...fixed, pincode: '560034' } }, 'manual'),
    ).rejects.toThrow('only within the same pincode');
    await expect(service.updateDetails('t', s.id, { rtoWarehouseId: mumbai.id }, 'manual')).rejects.toBeInstanceOf(InvalidOperationError);
  });

  it('zeroes the COD amount when switching to prepaid', async () => {
    const s = await service.create('t', input, { triggered: true });
    expect((await service.updateDetails('t', s.id, { paymentMode: 'PREPAID' }, 'manual')).codAmount).toBe(0);
  });

  it('locks parcel fields after booking but still allows customer contact changes', async () => {
    const s = await service.create('t', input, { triggered: true });
    await booking.assign('t', s.id, 'ekart');
    await expect(service.updateDetails('t', s.id, { weightKg: 3 }, 'manual')).rejects.toBeInstanceOf(InvalidOperationError);
    const updated = await service.updateDetails('t', s.id, { customer: { name: 'Priya N', phone: '9000000000' } }, 'manual');
    expect(updated.customer.phone).toBe('9000000000');
  });

  it('is a no-op when nothing actually changed', async () => {
    const s = await service.create('t', input, { triggered: true });
    const before = events.events.length;
    await service.updateDetails('t', s.id, { weightKg: 1 }, 'manual');
    expect(events.events.length).toBe(before);
  });

  it('reassigns by booking the new courier first, then cancelling the old one', async () => {
    const s = await service.create('t', input, { triggered: true });
    await booking.assign('t', s.id, 'ekart');
    const reassigned = await booking.assign('t', s.id, 'delhivery');
    expect(reassigned).toMatchObject({ courier: 'delhivery', awb: 'DELHIVERY-AWB', status: 'assigned' });
    expect(gateway.cancelShipment).toHaveBeenCalledWith('ekart', 'EKART-AWB');
    expect(gateway.createShipment.mock.invocationCallOrder[1]).toBeLessThan(gateway.cancelShipment.mock.invocationCallOrder[0]);
    expect(reassigned.events.at(-1)!.note).toContain('Reassigned from ekart');
  });

  it('keeps the existing booking when the new courier stays down', async () => {
    const s = await service.create('t', input, { triggered: true });
    await booking.assign('t', s.id, 'ekart');
    gateway.createShipment.mockRejectedValue(new CourierUnavailableError('delhivery', '503'));
    await expect(booking.assign('t', s.id, 'delhivery')).rejects.toBeInstanceOf(UpstreamError);
    expect(gateway.cancelShipment).not.toHaveBeenCalled();
    expect((await service.get('t', s.id)).courier).toBe('ekart');
  });

  it('refuses to change courier once the parcel is picked up', async () => {
    const s = await service.create('t', input, { triggered: true });
    await booking.assign('t', s.id, 'ekart');
    await service.applyStatus('t', s.id, 'picked_up', 'test');
    await expect(booking.assign('t', s.id, 'delhivery')).rejects.toThrow("can't be changed once a shipment is picked up");
  });
});
