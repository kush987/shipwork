import { set } from 'lodash';
import { CourierIntegrationService } from './courier-integration.service';
import { IntegratedCourierProvider } from './integrated-courier.provider';
import { RealCourierFactory } from '../infrastructure/integrations/real-courier.factory';
import { SimulatedCourierProvider } from '../infrastructure/providers/simulated-courier.provider';
import { COURIER_PROFILES } from '../infrastructure/providers/courier-profiles.constants';
import { ValidationFailedError } from '../../../shared/domain/errors';
import type { CourierCredentials } from '../domain/courier-integration.types';
import type { RealCourierProvider } from '../domain/courier-provider.types';
import { CourierNotConnectedError } from '../domain/courier-provider';
import { courierReference } from '../domain/courier-integration';

/** Just enough of a Mongoose model for the service. */
class FakeModel {
  docs = new Map<string, Record<string, any>>();
  find() {
    return { lean: async () => [...this.docs.values()].map((d) => structuredClone(d)) };
  }
  findById(id: string) {
    return { lean: async () => (this.docs.has(id) ? structuredClone(this.docs.get(id)!) : null) };
  }
  async replaceOne(filter: { _id: string }, doc: Record<string, unknown>) {
    this.docs.set(filter._id, { _id: filter._id, ...structuredClone(doc) });
  }
  async updateOne(filter: { _id: string }, update: { $set: Record<string, unknown> }) {
    const doc = this.docs.get(filter._id) ?? { _id: filter._id, mode: 'simulated', settings: { sandbox: {}, live: {} }, lastTest: {}, updatedAt: new Date() };
    for (const [path, value] of Object.entries(update.$set)) set(doc, path, value);
    this.docs.set(filter._id, doc);
  }
}

function setup(testConnection: () => Promise<string> = async () => 'Signed in') {
  const model = new FakeModel();
  const built: CourierCredentials[] = [];
  const real = {
    has: (code: string) => ['delhivery', 'xpressbees', 'bluedart', 'ekart'].includes(code),
    create: (code: string, name: string, credentials: CourierCredentials) => {
      built.push(credentials);
      return { code, name, testConnection, getRate: async () => ({ courierCode: code, courierName: name, total: 99, freight: 99, codFee: 0, estimatedDays: 2, zone: 'local' }) } as unknown as RealCourierProvider;
    },
  } as unknown as RealCourierFactory;
  const service = new CourierIntegrationService(model as never, real);
  return { model, service, built, real };
}

describe('CourierIntegrationService', () => {
  it('starts on the simulation, with every setting empty', async () => {
    const { service } = setup();
    const view = await service.view('delhivery');
    expect(view.mode).toBe('simulated');
    expect(view.envs.sandbox).toMatchObject({ ready: false, missing: ['API token', 'Pickup location name'], baseUrl: 'https://staging-express.delhivery.com', lastTest: null });
    expect(view.envs.live.baseUrl).toBe('https://track.delhivery.com');
  });

  it('keeps secrets encrypted and never shows them; "" keeps a secret, null clears a setting', async () => {
    const { service, model } = setup();
    const view = await service.update('delhivery', { env: 'sandbox', values: { apiToken: 'dlv-secret-token-9876', pickupLocation: ' Okhla WH ' } }, 'usr_1');
    const stored = model.docs.get('delhivery')!;
    expect(stored.settings.sandbox.apiToken).not.toContain('dlv-secret');
    expect(stored.settings.sandbox.pickupLocation).toBe('Okhla WH');
    const token = view.envs.sandbox.fields.find((f) => f.key === 'apiToken')!;
    expect(token).toMatchObject({ set: true, value: '••••9876', secret: true });
    expect(JSON.stringify(view)).not.toContain('dlv-secret');

    await service.update('delhivery', { env: 'sandbox', values: { apiToken: '', pickupLocation: 'Okhla 2' } }, 'usr_1');
    expect(await service.update('delhivery', { mode: 'sandbox' }, 'usr_1')).toMatchObject({ mode: 'sandbox' });
    expect(await service.activeCredentials('delhivery')).toEqual({
      env: 'sandbox',
      baseUrl: 'https://staging-express.delhivery.com',
      values: { apiToken: 'dlv-secret-token-9876', pickupLocation: 'Okhla 2' },
    });

    await service.update('delhivery', { env: 'sandbox', values: { baseUrl: 'https://my-sandbox.delhivery.com/' } }, 'usr_1');
    expect((await service.activeCredentials('delhivery'))!.baseUrl).toBe('https://my-sandbox.delhivery.com');
    await expect(service.update('delhivery', { env: 'sandbox', values: { apiToken: null } }, 'usr_1')).rejects.toThrow('To use the sandbox account, fill in its API token');
  });

  it('a sandbox or live mode needs that account’s required settings; unknown settings are refused', async () => {
    const { service } = setup();
    const error = await service.update('bluedart', { mode: 'live' }, null).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationFailedError);
    expect(error.message).toBe('To use the live account, fill in its Client ID, Client secret, Login ID, Licence key, Customer code, Origin area');
    await expect(service.update('ekart', { env: 'live', values: { apiKey: 'x' } }, null)).rejects.toThrow('Unknown setting “apiKey”');
    await expect(service.update('ekart', { values: { username: 'x' } }, null)).rejects.toThrow('Say which environment');
    expect((await service.view('bluedart')).mode).toBe('simulated');
  });

  it('Test connection runs against the chosen account and keeps the result; new settings clear it', async () => {
    const { service, built } = setup();
    expect(await service.test('xpressbees', 'sandbox')).toMatchObject({ ok: false, message: 'Fill in Account email, Password first' });
    await service.update('xpressbees', { env: 'sandbox', values: { email: 'ops@seller.in', password: 'pw-1' } }, null);
    expect(await service.test('xpressbees', 'sandbox')).toMatchObject({ ok: true, message: 'Signed in' });
    expect(built.at(-1)).toMatchObject({ env: 'sandbox', values: { email: 'ops@seller.in', password: 'pw-1' } });
    expect((await service.view('xpressbees')).envs.sandbox.lastTest).toMatchObject({ ok: true });
    await service.update('xpressbees', { env: 'sandbox', values: { password: 'pw-2' } }, null);
    expect((await service.view('xpressbees')).envs.sandbox.lastTest).toBeNull();

    const failing = setup(async () => {
      throw new Error('XpressBees refused the credentials (HTTP 401)');
    });
    await failing.service.update('xpressbees', { env: 'live', values: { email: 'a', password: 'b' } }, null);
    expect(await failing.service.test('xpressbees', 'live')).toMatchObject({ ok: false, message: 'XpressBees refused the credentials (HTTP 401)' });
  });
});

describe('IntegratedCourierProvider', () => {
  it('uses the simulation until an account is chosen, then the real API — no restart', async () => {
    const { service, real } = setup();
    const profile = COURIER_PROFILES.find((p) => p.code === 'delhivery')!;
    const provider = new IntegratedCourierProvider(new SimulatedCourierProvider({ ...structuredClone(profile), simulation: { failureRate: 0, latencyMs: 0 } }), service, real);
    const parcel = { reference: 'r', paymentMode: 'PREPAID' as const, codAmount: 0, orderValue: 500, weightKg: 1, pickupPincode: '110020', deliveryPincode: '560001', customer: { name: 'M', phone: '9999999999' }, items: [] };
    expect((await provider.getRate(parcel)).total).not.toBe(99);
    expect(provider.timeoutMs).toBeUndefined();

    await service.update('delhivery', { env: 'live', values: { apiToken: 'live-token-123456', pickupLocation: 'WH' }, mode: 'live' }, null);
    expect((await provider.getRate(parcel)).total).toBe(99);
    expect(provider.mode).toBe('live');
    expect(provider.timeoutMs).toBe(30_000);

    await service.update('delhivery', { mode: 'simulated' }, null);
    expect((await provider.getRate(parcel)).total).not.toBe(99);

    // A call can ask for a connection of its own: the live account while the courier runs simulated, or the reverse.
    expect((await (await provider.using('live')).getRate(parcel)).total).toBe(99);
    await service.update('delhivery', { mode: 'live' }, null);
    expect(await provider.using('simulated')).toBe(provider.simulated);
    await expect(provider.using('sandbox')).rejects.toThrow("Delhivery's sandbox account isn't set up on the Couriers page (missing API token, Pickup location name)");
    await expect(provider.using('sandbox')).rejects.toBeInstanceOf(CourierNotConnectedError);
  });
});

describe('courierReference', () => {
  it('gives couriers letters, digits and dashes only, at most 50, the same every time', () => {
    expect(courierReference('ex_mw95wasm2b2db44363:book')).toBe('ex-mw95wasm2b2db44363-book');
    expect(courierReference('ref:rec_mw93me9gd52dc82e86')).toBe('ref-rec-mw93me9gd52dc82e86');
    const long = courierReference(`ref:${'a'.repeat(80)}`);
    expect(long).toHaveLength(50);
    expect(courierReference(`ref:${'a'.repeat(80)}`)).toBe(long);
  });
});
