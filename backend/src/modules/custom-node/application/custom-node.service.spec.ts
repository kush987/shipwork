import { CustomNodeService } from './custom-node.service';
import { QuickJsSandbox } from '../infrastructure/quickjs-sandbox';
import { InMemoryCustomNodes, riskNodeSpec } from '../../../testing/custom-node-fakes';
import { ValidationFailedError } from '../../../shared/domain/errors';

describe('CustomNodeService', () => {
  let repo: InMemoryCustomNodes;
  let service: CustomNodeService;

  beforeEach(() => {
    repo = new InMemoryCustomNodes();
    service = new CustomNodeService(repo, new QuickJsSandbox());
  });

  it('derives a stable custom.* type from the label, unique per tenant', async () => {
    expect((await service.create('t', riskNodeSpec())).type).toBe('custom.cod-risk-check');
    expect((await service.create('t', riskNodeSpec())).type).toBe('custom.cod-risk-check-2');
  });

  it('creates a new immutable version on every real change', async () => {
    const node = await service.create('t', riskNodeSpec());
    const same = await service.update('t', node.id, riskNodeSpec());
    expect(same.latestVersion).toBe(1);
    const v2 = await service.update('t', node.id, { ...riskNodeSpec(), description: 'changed' });
    expect(v2.latestVersion).toBe(2);
    expect((await service.resolveVersion('t', node.type, 1))!.description).toBe('Flags high COD');
    expect((await service.resolveVersion('t', node.type))!.version).toBe(2);
  });

  it('stops resolving the latest version once archived, but keeps pinned versions runnable', async () => {
    const node = await service.create('t', riskNodeSpec());
    await service.setArchived('t', node.id, true);
    expect(await service.resolveVersion('t', node.type)).toBeNull();
    expect(await service.resolveVersion('t', node.type, 1)).not.toBeNull();
  });

  it('rejects invalid definitions with every problem listed', async () => {
    const error = await service
      .create('t', {
        ...riskNodeSpec('const nope = 1;'),
        configSchema: [
          { key: '1bad', label: '', kind: 'text' },
          { key: 'mode', label: 'Mode', kind: 'select' },
        ],
        outputs: [
          { id: 'a', label: 'A' },
          { id: 'a', label: 'A again' },
        ],
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ValidationFailedError);
    const messages = (error as ValidationFailedError).issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"1bad" must be a letter'),
        expect.stringContaining('needs a label'),
        expect.stringContaining('"mode" needs at least one option'),
        expect.stringContaining('"a" is used twice'),
      ]),
    );
  });

  it('rejects code without run()', async () => {
    await expect(service.create('t', riskNodeSpec('const x = 1;'))).rejects.toThrow(ValidationFailedError);
  });

  it('test() renders {{placeholders}} in config and normalises the result', async () => {
    const spec = riskNodeSpec(`function run({ config }) { return config.greeting; }`);
    const result = await service.test(spec, {
      config: { greeting: 'Hi {{shipment.customer.name}}' },
      shipment: { customer: { name: 'Priya' } },
      context: {},
      trigger: { event: 'manual.test' },
    });
    expect(result).toMatchObject({ ok: true, result: { outputHandle: 'risky', output: 'Hi Priya', context: {} } });
  });

  it('test() reports an unknown output handle as an error', async () => {
    const result = await service.test(riskNodeSpec(`function run() { return { outputHandle: 'maybe' }; }`), {
      config: {},
      shipment: null,
      context: {},
      trigger: { event: 'x' },
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("'maybe'") });
  });
});
