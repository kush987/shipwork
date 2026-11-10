import { Logger } from '@nestjs/common';
import { CourierApiNode } from './courier-api.node';
import { CourierRegistry } from '../../../courier/application/courier-registry';
import { CourierGateway } from '../../../courier/application/courier-gateway';
import { CourierRejectedError, CourierUnavailableError } from '../../../courier/domain/courier-provider';
import { SimulatedCourierProvider } from '../../../courier/infrastructure/providers/simulated-courier.provider';
import { COURIER_PROFILES } from '../../../courier/infrastructure/providers/courier-profiles.constants';
import { NonRetryableError, RetryableError } from '../../../../shared/domain/errors';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';

const shipment = {
  paymentMode: 'COD',
  codAmount: 1500,
  orderValue: 1500,
  weightKg: 1.2,
  customer: { name: 'Meera Iyer', phone: '+91 98450 12345' },
  deliveryAddress: { line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  pickup: { name: 'Okhla', contactName: 'Ravi', phone: '9811111111', line1: 'Plot 4', city: 'New Delhi', state: 'Delhi', pincode: '110020' },
  rto: { line1: 'Plot 9', city: 'Gurugram', state: 'Haryana', pincode: '122001' },
  items: [{ name: 'Kurta', sku: 'KU-1', qty: 2, price: 750 }],
  awb: 'EK123',
};

const ctx = (config: Record<string, unknown>, context: Record<string, unknown> = { shipment }): NodeExecutionContext => ({
  tenantId: 't',
  executionId: 'ex',
  nodeId: 'book',
  idempotencyKey: 'ex:book',
  attempt: 1,
  isFinalAttempt: true,
  config,
  data: { trigger: { event: 'http.request', data: {} }, context, shipment: null } as NodeExecutionContext['data'],
  logger: new Logger('test'),
});

function setup() {
  const registry = new CourierRegistry(COURIER_PROFILES.map((p) => new SimulatedCourierProvider({ ...structuredClone(p), simulation: { failureRate: 0, latencyMs: 0 } })));
  const gateway = {
    getRates: jest.fn(async (_p, codes: string[]) => ({ quotes: [{ courierCode: codes[0], courierName: 'Ekart', total: 172.28, freight: 142.28, codFee: 30, estimatedDays: 5, zone: 'national' }], skipped: [] })),
    checkServiceability: jest.fn(async () => [{ courierCode: 'ekart', courierName: 'Ekart', serviceable: false, reason: 'Pincode 560001 not covered' }]),
    createShipment: jest.fn(async () => ({ awb: 'EK999', courierCode: 'ekart', labelUrl: 'https://label', reference: 'ex:book:ekart', replayed: false })),
    cancelShipment: jest.fn(async () => ({ cancelled: true })),
    trackShipment: jest.fn(async () => [
      { status: 'picked_up', at: '2026-11-09T10:00:00Z' },
      { status: 'in_transit', at: '2026-11-10T10:00:00Z', location: 'Nagpur' },
    ]),
  };
  return { node: new CourierApiNode(gateway as unknown as CourierGateway, registry), gateway };
}

describe('Courier API step', () => {
  it('books from the parcel template, exactly once per run and step', async () => {
    const { node, gateway } = setup();
    const result = await node.execute(ctx({ courier: 'ekart', operation: 'book' }));
    expect(result).toMatchObject({ outputHandle: 'ok', contextPatch: { courier: { courier: 'ekart', operation: 'book', awb: 'EK999', labelUrl: 'https://label' } } });
    const [tenant, courier, parcel, key, connection] = gateway.createShipment.mock.calls[0] as unknown as [string, string, Record<string, any>, string, string];
    expect([tenant, courier, key, connection]).toEqual(['t', 'ekart', 'ex:book', 'default']);
    expect(parcel).toMatchObject({
      paymentMode: 'COD',
      codAmount: 1500,
      weightKg: 1.2,
      pickupPincode: '110020',
      deliveryPincode: '560001',
      pickupContact: { name: 'Ravi', phone: '9811111111' },
      rtoAddress: { pincode: '122001' },
      items: [{ name: 'Kurta', sku: 'KU-1', quantity: 2, unitPrice: 750 }],
    });
  });

  it('prices, checks serviceability, tracks and cancels; saves under saveAs', async () => {
    const { node } = setup();
    expect((await node.execute(ctx({ courier: 'ekart', operation: 'rates', saveAs: 'quote' }))).contextPatch).toEqual({
      quote: expect.objectContaining({ courier: 'ekart', operation: 'rates', total: 172.28 }),
    });
    expect((await node.execute(ctx({ courier: 'ekart', operation: 'serviceability' }))).output).toMatchObject({ serviceable: false, reason: 'Pincode 560001 not covered' });
    expect((await node.execute(ctx({ courier: 'ekart', operation: 'track', awb: '{{context.shipment.awb}}' }))).output).toMatchObject({ awb: 'EK123', status: 'in_transit', lastScanAt: '2026-11-10T10:00:00Z' });
    expect((await node.execute(ctx({ courier: 'ekart', operation: 'cancel', awb: 'EK123' }))).output).toMatchObject({ awb: 'EK123', cancelled: true });
  });

  it('the courier saying no takes "Courier said no"; an unreachable courier is retried; a bad parcel fails with every problem', async () => {
    const { node, gateway } = setup();
    gateway.createShipment.mockRejectedValueOnce(new CourierRejectedError('ekart', 'Ekart did not book it: Duplicate order'));
    expect(await node.execute(ctx({ courier: 'ekart', operation: 'book' }))).toMatchObject({
      outputHandle: 'rejected',
      contextPatch: { courier: { rejected: true, reason: 'Ekart did not book it: Duplicate order' } },
    });
    gateway.createShipment.mockRejectedValueOnce(new CourierUnavailableError('ekart', 'Ekart answered HTTP 503'));
    await expect(node.execute(ctx({ courier: 'ekart', operation: 'book' }))).rejects.toBeInstanceOf(RetryableError);

    const bad = node.execute(ctx({ courier: 'ekart', operation: 'book', parcel: JSON.stringify({ paymentMode: 'COD', weightKg: 0, pickupPincode: '1100', deliveryPincode: '560001' }) }));
    await expect(bad).rejects.toBeInstanceOf(NonRetryableError);
    await expect(bad).rejects.toThrow(/weightKg must be a number above 0; codAmount must be above 0 for COD; pickupPincode must be 6 digits; customer.name is needed to book/);
  });

  it('the courier can come from data; the connection and a booking reference are passed on', async () => {
    const { node, gateway } = setup();
    const result = await node.execute(
      ctx({ courier: '{{context.quote.courier}}', operation: 'book', connection: 'live', reference: '{{context.shipment.id}}' }, { shipment: { ...shipment, id: 'rec_1' }, quote: { courier: 'Ekart' } }),
    );
    expect(result.output).toMatchObject({ courier: 'ekart', connection: 'live', awb: 'EK999' });
    expect(gateway.createShipment.mock.calls[0]).toEqual(['t', 'ekart', expect.any(Object), 'ref:rec_1', 'live']);
    await node.execute(ctx({ courier: 'ekart', operation: 'rates', connection: 'simulated' }));
    expect(gateway.getRates).toHaveBeenLastCalledWith(expect.any(Object), ['ekart'], 'simulated');
    await expect(node.execute(ctx({ courier: '{{context.nothing}}', operation: 'rates' }))).rejects.toThrow('The courier is empty');
  });

  it('checks its settings when the workflow is saved', () => {
    const { node } = setup();
    expect(node.validateConfig({ operation: 'rates' })).toEqual(['Choose the courier']);
    expect(node.validateConfig({ courier: 'dhl', operation: 'rates' })).toEqual(['Unknown courier dhl']);
    expect(node.validateConfig({ courier: 'ekart', operation: 'track' })).toEqual(['Give the AWB to cancel or track']);
    expect(node.validateConfig({ courier: '{{context.quote.courier}}', operation: 'rates' })).toEqual([]);
    expect(node.validateConfig({ courier: 'ekart', operation: 'rates', connection: 'staging' })).toEqual(['Connection must be one of default, simulated, sandbox, live']);
    expect(node.definition.configSchema[0].options?.map((o) => o.value)).toEqual(['ekart', 'delhivery', 'bluedart', 'xpressbees']);
  });
});
