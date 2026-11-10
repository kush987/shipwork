import { CourierRejectedError } from '../../domain/courier-provider';
import { SimulatedCourierProvider } from './simulated-courier.provider';
import { CourierProvider, ParcelDetails } from '../../domain/courier-provider.types';
import { COURIER_PROFILES } from './courier-profiles.constants';

/**
 * Contract tests: every adapter must behave identically from the engine's point of view.
 * A real HTTP adapter would run this same suite against the courier's sandbox.
 */
const adapters: CourierProvider[] = COURIER_PROFILES.map(
  (p) => new SimulatedCourierProvider({ ...structuredClone(p), simulation: { failureRate: 0, latencyMs: 0 } }),
);

const parcel = (overrides: Partial<ParcelDetails> = {}): ParcelDetails => ({
  reference: `ref-${Math.random()}`,
  paymentMode: 'COD',
  codAmount: 1200,
  orderValue: 1200,
  weightKg: 1.2,
  pickupPincode: '560001',
  deliveryPincode: '110001',
  customer: { name: 'Asha', phone: '9876543210' },
  items: [{ name: 'Cotton kurta', sku: 'KUR-001', quantity: 1, unitPrice: 1200 }],
  ...overrides,
});

describe.each(adapters.map((a) => [a.code, a] as const))('CourierProvider contract: %s', (_, adapter) => {
  it('quotes a positive total that includes the COD fee', async () => {
    const quote = await adapter.getRate(parcel());
    expect(quote.courierCode).toBe(adapter.code);
    expect(quote.total).toBeGreaterThan(0);
    expect(quote.codFee).toBeGreaterThan(0);
    expect(quote.total).toBeCloseTo(quote.freight + quote.codFee, 2);
  });

  it('charges no COD fee for prepaid orders', async () => {
    expect((await adapter.getRate(parcel({ paymentMode: 'PREPAID', codAmount: 0 }))).codFee).toBe(0);
  });

  it('is idempotent per reference', async () => {
    const p = parcel();
    const first = await adapter.createShipment(p);
    const second = await adapter.createShipment(p);
    expect(second.awb).toBe(first.awb);
    expect(await adapter.findShipmentByReference(p.reference)).toEqual(first);
  });

  it('rejects unserviceable parcels with CourierRejectedError', async () => {
    await expect(adapter.createShipment(parcel({ weightKg: 500 }))).rejects.toBeInstanceOf(CourierRejectedError);
  });

  it('tracks and cancels a booked shipment', async () => {
    const booking = await adapter.createShipment(parcel());
    expect((await adapter.trackShipment(booking.awb)).length).toBeGreaterThan(0);
    await expect(adapter.cancelShipment(booking.awb)).resolves.toEqual({ cancelled: true });
  });
});
