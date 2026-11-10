import { CustomWorkflowNode } from './custom-workflow-node';
import { QuickJsSandbox } from '../../../custom-node/infrastructure/quickjs-sandbox';
import { riskNodeSpec, simpleNodeSpec } from '../../../../testing/custom-node-fakes';
import { NonRetryableError } from '../../../../shared/domain/errors';
import type { CustomNodeSpec, CustomNodeVersion } from '../../../custom-node/domain/custom-node.types';
import type { EventDefinitionService } from '../../../custom-event/application/event-definition.service';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';

const version = (spec: CustomNodeSpec): CustomNodeVersion => ({
  ...spec,
  customNodeId: 'cn_1',
  tenantId: 't',
  type: 'custom.cod-risk-check',
  version: 3,
  createdAt: new Date().toISOString(),
});

const sandbox = new QuickJsSandbox();
const node = (spec: CustomNodeSpec) => new CustomWorkflowNode(version(spec), sandbox, {} as EventDefinitionService);

const ctx = (config: Record<string, unknown>) => {
  const warnings: string[] = [];
  const context = {
    tenantId: 't',
    executionId: 'ex1',
    config,
    data: { shipment: { id: 'shp_1', codAmount: 2500 }, context: {}, request: null, trigger: { event: 'shipment.created', data: null } },
    logger: { log: () => undefined, warn: (m: string) => warnings.push(m) },
  } as unknown as NodeExecutionContext;
  return { context, warnings };
};

describe('CustomWorkflowNode', () => {
  it('gives simple-format nodes a "Save result as" setting and an optional Failed branch', () => {
    const def = node(simpleNodeSpec(undefined, { resultName: 'codCheck', errorBranch: true, resultSchema: [{ key: 'risky', type: 'boolean', required: true }] })).definition;
    expect(def.configSchema.map((f) => f.key)).toEqual(['threshold', 'saveAs']);
    expect(def.configSchema[1]).toMatchObject({ label: 'Save result as', default: 'codCheck' });
    expect(def.outputs.map((o) => o.id)).toEqual(['risky', 'safe', 'failed']);
    expect(def.custom).toEqual({ id: 'cn_1', version: 3, resultFields: ['risky'] });
  });

  it('leaves classic nodes exactly as authored', () => {
    const def = node(riskNodeSpec()).definition;
    expect(def.configSchema.map((f) => f.key)).toEqual(['threshold']);
    expect(def.outputs.map((o) => o.id)).toEqual(['risky', 'safe']);
    expect(def.custom).toEqual({ id: 'cn_1', version: 3 });
  });

  it('saves a simple-format result under the chosen name and follows its branch', async () => {
    const impl = node(simpleNodeSpec(undefined, { resultName: 'codCheck' }));
    const result = await impl.execute(ctx({ threshold: 2000, saveAs: 'risk' }).context);
    expect(result).toEqual({
      outputHandle: 'risky',
      output: { result: { risky: true, codAmount: 2500 }, savedAs: 'risk', logs: [], version: 3 },
      contextPatch: { risk: { risky: true, codAmount: 2500 } },
    });
    // No "Save result as" in the config (e.g. an older workflow): the node's own result name.
    expect((await impl.execute(ctx({ threshold: 2000 }).context)).contextPatch).toEqual({ codCheck: { risky: true, codAmount: 2500 } });
  });

  it('keeps the classic context patch for classic nodes', async () => {
    const result = await node(riskNodeSpec()).execute(ctx({ threshold: 2000 }).context);
    expect(result).toMatchObject({ outputHandle: 'risky', output: { result: { risky: true } }, contextPatch: { codRisk: 'high' } });
  });

  it('logs result warnings and records them in the step output', async () => {
    const impl = node(simpleNodeSpec('function run() { return {}; }', { resultSchema: [{ key: 'risky', type: 'boolean', required: true }] }));
    const { context, warnings } = ctx({ threshold: 1 });
    const result = await impl.execute(context);
    expect(warnings).toEqual(['[custom] Result: risky is required']);
    expect(result.output).toMatchObject({ warnings: ['Result: risky is required'] });
  });

  it('fails without retries when the code fails, so a wired Failed branch can take over', async () => {
    const impl = node(simpleNodeSpec(`function run() { fail('No COD amount'); }`, { errorBranch: true }));
    await expect(impl.execute(ctx({}).context)).rejects.toThrow(NonRetryableError);
    await expect(impl.execute(ctx({}).context)).rejects.toThrow('COD risk check v3: No COD amount');
  });

  it('validates the "Save result as" name for simple-format nodes only', () => {
    expect(node(simpleNodeSpec()).validateConfig({ saveAs: 'rates' })).toEqual([expect.stringContaining('used by built-in steps')]);
    expect(node(riskNodeSpec()).validateConfig({ saveAs: 'rates' })).toEqual([]);
  });
});
