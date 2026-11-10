import { CustomNodeService } from './custom-node.service';
import { QuickJsSandbox } from '../infrastructure/quickjs-sandbox';
import { InMemoryCustomNodes, riskNodeSpec, simpleNodeSpec } from '../../../testing/custom-node-fakes';
import { ValidationFailedError } from '../../../shared/domain/errors';
import type { CustomNodeInput } from './custom-node-runner.types';

const input = (over: Partial<CustomNodeInput> = {}): CustomNodeInput => ({
  config: { threshold: 2000 },
  shipment: { codAmount: 2500 },
  context: {},
  trigger: { event: 'manual.test' },
  ...over,
});

const issuesOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ValidationFailedError);
  return (error as ValidationFailedError).issues.map((i) => i.message);
};

describe('simple-format custom nodes', () => {
  let repo: InMemoryCustomNodes;
  let service: CustomNodeService;

  beforeEach(() => {
    repo = new InMemoryCustomNodes();
    service = new CustomNodeService(repo, new QuickJsSandbox());
  });

  describe('running code', () => {
    it('treats the return value as the result and branch() as the path', async () => {
      expect(await service.test(simpleNodeSpec(), input())).toMatchObject({
        ok: true,
        result: { outputHandle: 'risky', output: { risky: true, codAmount: 2500 }, context: {}, emit: [] },
        warnings: [],
      });
    });

    it('continues on the first branch when branch() is not called, and returns null for no value', async () => {
      const result = await service.test(simpleNodeSpec('function run() { console.log("hi"); }'), input());
      expect(result).toMatchObject({ ok: true, result: { outputHandle: 'risky', output: null }, logs: ['hi'] });
    });

    it('returns any JSON value as the result, including a plain object with classic-looking keys', async () => {
      const result = await service.test(simpleNodeSpec('function run() { return { output: 1, context: 2 }; }'), input());
      expect(result).toMatchObject({ ok: true, result: { output: { output: 1, context: 2 }, context: {} } });
    });

    it('names the valid branches when branch() gets an unknown one', async () => {
      const result = await service.test(simpleNodeSpec(`function run() { return branch('maybe', 1); }`), input());
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("branch('maybe') is not a branch of this node — use one of 'risky', 'safe'") });
    });

    it('fail() fails the run with the message', async () => {
      const result = await service.test(simpleNodeSpec(`function run() { fail('Amount is missing'); }`), input());
      expect(result).toMatchObject({ ok: false, error: 'Amount is missing' });
    });

    it('emit() queues custom events (both call styles) and rejects built-in ones', async () => {
      const code = `function run() { emit('custom.alert', { reason: 'x' }); emit({ event: 'custom.other' }); return 1; }`;
      expect(await service.test(simpleNodeSpec(code), input())).toMatchObject({
        ok: true,
        result: { emit: [{ event: 'custom.alert', payload: { reason: 'x' } }, { event: 'custom.other', payload: {} }] },
      });
      const builtIn = await service.test(simpleNodeSpec(`function run() { emit('shipment.delivered'); }`), input());
      expect(builtIn).toMatchObject({ ok: false, error: expect.stringContaining('built-in') });
    });

    it('lets helper names be shadowed by the user code without breaking run()', async () => {
      const code = `function fail(x) { return 'not failing ' + x; }\nfunction run() { return fail('a'); }`;
      expect(await service.test(simpleNodeSpec(code), input())).toMatchObject({ ok: true, result: { output: 'not failing a' } });
    });

    it('warns when the result does not match the described result fields', async () => {
      const spec = simpleNodeSpec(`function run() { return { risky: 'yes' }; }`, {
        resultSchema: [
          { key: 'risky', type: 'boolean', required: true },
          { key: 'codAmount', type: 'number', required: true },
        ],
      });
      const result = await service.test(spec, input());
      expect(result).toMatchObject({ ok: true, warnings: ['Result: risky must be a boolean', 'Result: codAmount is required'] });
      const notObject = await service.test({ ...spec, code: 'function run() { return 5; }' }, input());
      expect(notObject).toMatchObject({ ok: true, warnings: [expect.stringContaining('returned a number')] });
    });

    it('renders {{request.*}} placeholders in settings before run()', async () => {
      const spec = simpleNodeSpec('function run({ config }) { return config.who; }');
      const result = await service.test(spec, input({ config: { who: 'Hi {{request.body.name}}' }, request: { body: { name: 'Asha' } } }));
      expect(result).toMatchObject({ ok: true, result: { output: 'Hi Asha' } });
    });
  });

  describe('saving', () => {
    it('fills in the result name from the label and keeps the simple-format options', async () => {
      const node = await service.create('t', simpleNodeSpec(undefined, { errorBranch: true }));
      expect(node).toMatchObject({ apiVersion: 2, resultName: 'codRiskCheck', resultSchema: [], errorBranch: true });
    });

    it('rejects code without run(), checked the way the simple format runs it', async () => {
      expect(await issuesOf(service.create('t', simpleNodeSpec('const x = 1;')))).toEqual([expect.stringContaining('function run')]);
    });

    it('lists every simple-format problem at once', async () => {
      const messages = await issuesOf(
        service.create(
          't',
          simpleNodeSpec(undefined, {
            configSchema: [
              { key: 'saveAs', label: 'Save', kind: 'text' },
              { key: 'mode', label: 'Mode', kind: 'select', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }], default: 'b' },
            ],
            outputs: [
              { id: 'failed', label: 'Failed' },
              { id: 'ok', label: '' },
            ],
            resultName: 'rates',
            resultSchema: [{ key: '1x', type: 'string', required: false }],
          }),
        ),
      );
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.stringContaining('"saveAs" is reserved'),
          expect.stringContaining('lists the same option value twice'),
          expect.stringContaining('default "b" is not one of its options'),
          expect.stringContaining('Branch id "failed" is reserved'),
          expect.stringContaining('Branch "ok" needs a label'),
          expect.stringContaining('Result name "rates" is used by built-in steps'),
          expect.stringContaining('Result: Field 1'),
        ]),
      );
    });

    it('does not apply simple-format rules to classic nodes', async () => {
      const classic = { ...riskNodeSpec(), configSchema: [{ key: 'saveAs', label: 'Save', kind: 'text' as const }] };
      await expect(service.create('t', classic)).resolves.toMatchObject({ type: 'custom.cod-risk-check' });
    });

    it('treats a classic node saved with apiVersion 1 as unchanged, and stored nulls as absent', async () => {
      const node = await service.create('t', riskNodeSpec());
      const stored = repo.nodes.get(node.id)!;
      stored.configSchema = stored.configSchema.map((f) => ({ ...f, options: null, help: null }) as never);
      expect((await service.update('t', node.id, { ...riskNodeSpec(), apiVersion: 1 })).latestVersion).toBe(1);
    });

    it('upgrading a classic node to the simple format is a new version', async () => {
      const node = await service.create('t', riskNodeSpec());
      const upgraded = await service.update('t', node.id, simpleNodeSpec());
      expect(upgraded).toMatchObject({ latestVersion: 2, apiVersion: 2, resultName: 'codRiskCheck' });
      expect((await service.resolveVersion('t', node.type, 1))!.apiVersion).toBeUndefined();
    });
  });
});
