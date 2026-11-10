import { ShipmentService } from './shipment.service';
import { ShipmentBookingService } from './shipment-booking.service';
import { ShipmentDispatchService } from './shipment-dispatch.service';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../testing/shipment-fakes';
import { CourierGateway } from '../../courier/application/courier-gateway';
import { CourierRegistry } from '../../courier/application/courier-registry';
import { ShipmentCreateNode } from '../../nodes/implementations/logistics/shipment-create.node';
import type { ParcelDetails } from '../../courier/domain/courier-provider.types';
import type { NodeExecutionContext } from '../../nodes/domain/workflow-node.types';

/** Fake couriers: "heavy" only takes parcels ≤ 2 kg; everyone quotes 100 + 10/kg. */
const COURIERS = ['ekart', 'lite'];
const serviceable = (code: string, p: ParcelDetails) => code !== 'lite' || p.weightKg <= 2;

describe('bulk courier assignment at trigger time', () => {
  let repo: InMemoryShipments;
  let dispatch: ShipmentDispatchService;
  let shipments: ShipmentService;
  let gateway: { createShipment: jest.Mock; checkServiceability: jest.Mock; getRates: jest.Mock };
  let input: ReturnType<typeof shipmentInput>;

  beforeEach(async () => {
    const { service: warehouses, delhi } = await warehouseFixture();
    input = shipmentInput(delhi.id, { paymentMode: 'PREPAID', codAmount: 0 });
    repo = new InMemoryShipments();
    shipments = new ShipmentService(repo, new RecordingPublisher(), warehouses);
    gateway = {
      createShipment: jest.fn(async (_t, courierCode: string, p: ParcelDetails) => ({ awb: `${courierCode}-${p.reference}`, courierCode, labelUrl: 'x', reference: p.reference, replayed: false })),
      checkServiceability: jest.fn(async (p: ParcelDetails, codes?: string[]) =>
        (codes?.length ? codes : COURIERS).map((c) => ({ courierCode: c, courierName: c, serviceable: serviceable(c, p), reason: serviceable(c, p) ? undefined : 'Weight above 2kg limit' })),
      ),
      getRates: jest.fn(async (p: ParcelDetails) => ({
        quotes: COURIERS.map((c) => ({ courierCode: c, courierName: c, total: 100 + 10 * p.weightKg, freight: 100, codFee: 0, estimatedDays: 3, zone: 'national' })),
        skipped: [],
      })),
    };
    const registry = {
      all: () => COURIERS.map((code) => ({ provider: { code, name: code.toUpperCase() }, breaker: { state: 'closed' }, enabled: true })),
      get: (code: string) => ({ enabled: true, provider: { code, name: code.toUpperCase() } }),
      has: () => true,
    } as unknown as CourierRegistry;
    const booking = new ShipmentBookingService(shipments, gateway as unknown as CourierGateway, registry, warehouses);
    dispatch = new ShipmentDispatchService(shipments, booking, registry);
  });

  const createLater = (weightKg: number, orderId: string) =>
    dispatch.create('t', { ...input, weightKg, orderId }, { mode: 'manual', courier: null });

  it('creates manual shipments without a courier and refuses to trigger them alone', async () => {
    const s = await createLater(1, 'A');
    expect(s).toMatchObject({ status: 'new', triggeredAt: null, dispatch: { mode: 'manual', courier: null } });
    await expect(dispatch.trigger('t', s.id, 'manual')).rejects.toThrow('Choose a courier');
    expect(repo.rows.get(s.id)!.triggeredAt).toBeNull();
    expect(repo.rows.get(s.id)!.events.map((e) => e.status)).toEqual(['new']);
  });

  it('summarises, per courier, how many selected shipments it can carry and the total cost', async () => {
    const a = await createLater(1, 'A');
    const b = await createLater(1.5, 'B');
    const c = await createLater(5, 'C');
    const options = await dispatch.bulkCourierOptions('t', [a.id, b.id, c.id]);
    expect(options[0]).toMatchObject({ courierCode: 'ekart', shipments: 3, serviceable: 3, totalCost: 375 });
    expect(options[1]).toMatchObject({ courierCode: 'lite', serviceable: 2, totalCost: 225, notCovered: [{ orderId: 'C', reason: 'Weight above 2kg limit' }] });
  });

  it('assigns one courier to every selected shipment; ones it cannot carry fail alone and stay pending', async () => {
    const a = await createLater(1, 'A');
    const b = await createLater(5, 'B');
    const result = await dispatch.bulkTrigger('t', [a.id, b.id], 'lite');
    expect(result).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(repo.rows.get(a.id)).toMatchObject({ status: 'assigned', courier: 'lite', dispatch: { courier: 'lite' } });
    expect(result.results.find((r) => r.id === b.id)!.error).toContain("can't take this shipment");
    expect(repo.rows.get(b.id)).toMatchObject({ status: 'new', triggeredAt: null, dispatch: { courier: null } });

    // Retry the leftover with a courier that can carry it.
    expect(await dispatch.bulkTrigger('t', [b.id], 'ekart')).toMatchObject({ succeeded: 1 });
    expect(repo.rows.get(b.id)).toMatchObject({ status: 'assigned', courier: 'ekart' });
  });

  it('overrides a courier chosen at creation when one is picked for the bulk trigger', async () => {
    const s = await dispatch.create('t', { ...input, weightKg: 1 }, { mode: 'manual', courier: 'ekart' });
    await dispatch.bulkTrigger('t', [s.id], 'lite');
    expect(repo.rows.get(s.id)).toMatchObject({ courier: 'lite' });
  });
});


describe('Create shipment step on an already-booked shipment', () => {
  it('continues down "Booked" with the existing booking instead of booking again', async () => {
    const createShipment = jest.fn();
    const node = new ShipmentCreateNode({ createShipment } as never, { all: () => [] } as never, {} as never);
    const ctx = {
      tenantId: 't',
      executionId: 'ex',
      idempotencyKey: 'ex:book',
      config: {},
      data: { shipment: { id: 's1', courier: 'bluedart', awb: 'BD123', labelUrl: 'x' }, context: { selectedCourier: { courierCode: 'ekart' } }, trigger: { event: 'shipment.created', data: {} } },
      logger: { warn: () => undefined },
    } as unknown as NodeExecutionContext;
    const result = await node.execute(ctx);
    expect(result).toMatchObject({ outputHandle: 'success', output: { alreadyBooked: true, courierCode: 'bluedart', awb: 'BD123' }, contextPatch: { booking: { awb: 'BD123' } } });
    expect(createShipment).not.toHaveBeenCalled();
  });
});
