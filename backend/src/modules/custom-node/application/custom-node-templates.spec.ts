import { CustomNodeService } from './custom-node.service';
import { QuickJsSandbox } from '../infrastructure/quickjs-sandbox';
import { InMemoryCustomNodes } from '../../../testing/custom-node-fakes';
import { CUSTOM_NODE_TEMPLATES } from './custom-node-templates';
import type { CustomNodeTemplate } from '../domain/custom-node.types';

const defaults = (t: CustomNodeTemplate) => Object.fromEntries(t.spec.configSchema.map((f) => [f.key, f.default]));
const template = (id: string) => CUSTOM_NODE_TEMPLATES.find((t) => t.id === id)!;

describe('custom node templates', () => {
  const service = new CustomNodeService(new InMemoryCustomNodes(), new QuickJsSandbox());

  it.each(CUSTOM_NODE_TEMPLATES.map((t) => [t.id, t] as const))('%s saves as is', async (_, t) => {
    await expect(service.create('t', t.spec)).resolves.toMatchObject({ apiVersion: 2, latestVersion: 1 });
  });

  const run = (id: string, input: { config?: Record<string, unknown>; shipment?: unknown; request?: unknown }) => {
    const t = template(id);
    return service.test(t.spec, {
      config: { ...defaults(t), ...input.config },
      shipment: input.shipment ?? null,
      request: input.request ?? null,
      context: {},
      trigger: { event: 'manual.test' },
    });
  };

  it('blank returns a value on its one branch', async () => {
    expect(await run('blank', {})).toMatchObject({ ok: true, result: { outputHandle: 'next', output: { ok: true } }, warnings: [] });
  });

  it('router compares the rendered amount with the threshold', async () => {
    expect(await run('router', { shipment: { codAmount: 2500 } })).toMatchObject({
      ok: true,
      result: { outputHandle: 'high', output: { high: true, amount: 2500, threshold: 2000 } },
      warnings: [],
    });
    expect(await run('router', { config: { amount: 'abc' } })).toMatchObject({ ok: false, error: expect.stringContaining('not a number') });
  });

  it('calculate totals the request items with tax and free shipping', async () => {
    const request = { body: { items: [{ price: 500, quantity: 2 }] } };
    expect(await run('calculate', { request })).toMatchObject({
      ok: true,
      result: { outputHandle: 'next', output: { itemCount: 1, subtotal: 1000, tax: 180, shipping: 0, total: 1180 } },
      warnings: [],
    });
  });

  it('validate lists every problem and picks the branch', async () => {
    expect(await run('validate', { request: { body: { email: 'nope' } } })).toMatchObject({
      ok: true,
      result: { outputHandle: 'invalid', output: { valid: false, errors: ['name is required', 'email is not a valid email'] } },
    });
    expect(await run('validate', { request: { body: { name: 'A', email: 'a@b.co' } } })).toMatchObject({ result: { outputHandle: 'valid' } });
  });

  it('message fills placeholders from the shipment', async () => {
    expect(await run('message', { config: { message: 'Order {{shipment.orderId}}', urgent: true }, shipment: { orderId: 'O1' } })).toMatchObject({
      ok: true,
      result: { output: { channel: 'slack', text: '[URGENT] Order O1', urgent: true } },
      warnings: [],
    });
  });

  it('raise-event emits the chosen event above the threshold', async () => {
    expect(await run('raise-event', { config: { alertEvent: 'custom.high_value' }, shipment: { orderValue: 9000 } })).toMatchObject({
      ok: true,
      result: { outputHandle: 'raised', emit: [{ event: 'custom.high_value', payload: { reason: 'Order value 9000' } }] },
    });
    expect(await run('raise-event', { shipment: { orderValue: 10 } })).toMatchObject({ result: { outputHandle: 'skipped', emit: [] } });
    expect(await run('raise-event', {})).toMatchObject({ ok: false, error: expect.stringContaining('needs a shipment') });
  });
});
