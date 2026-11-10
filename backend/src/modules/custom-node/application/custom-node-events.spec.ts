import { CustomNodeService } from './custom-node.service';
import { QuickJsSandbox } from '../infrastructure/quickjs-sandbox';
import { InMemoryCustomNodes, riskNodeSpec } from '../../../testing/custom-node-fakes';
import { InMemoryEventDefinitions, InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../testing/shipment-fakes';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { EventDefinitionService } from '../../custom-event/application/event-definition.service';
import { CustomWorkflowNode } from '../../nodes/implementations/custom/custom-workflow-node';
import { NonRetryableError } from '../../../shared/domain/errors';
import type { CustomNodeSpec } from '../domain/custom-node.types';
import type { NodeExecutionContext } from '../../nodes/domain/workflow-node.types';

const alertSpec = (code: string): CustomNodeSpec => ({
  ...riskNodeSpec(code),
  label: 'Raise alert',
  configSchema: [
    { key: 'alertEvent', label: 'Event to raise', kind: 'select', optionsSource: 'custom-events', required: true },
    { key: 'threshold', label: 'Threshold', kind: 'number', default: 2000 },
  ],
});

const RAISE = `function run({ config, shipment }) {
  if (shipment.orderValue <= Number(config.threshold)) return { outputHandle: 'safe' };
  return { outputHandle: 'risky', emit: { event: config.alertEvent, payload: { reason: 'value ' + shipment.orderValue } } };
}`;

describe('custom nodes with event settings', () => {
  const sandbox = new QuickJsSandbox();
  let customNodes: CustomNodeService;
  let events: EventDefinitionService;
  let publisher: RecordingPublisher;
  let shipments: ShipmentService;

  beforeEach(async () => {
    customNodes = new CustomNodeService(new InMemoryCustomNodes(), sandbox);
    const { service: warehouses } = await warehouseFixture();
    publisher = new RecordingPublisher();
    shipments = new ShipmentService(new InMemoryShipments(), publisher, warehouses);
    events = new EventDefinitionService(new InMemoryEventDefinitions(), shipments, publisher);
    await events.create('t', { label: 'High value alert', description: '', payloadSchema: [{ key: 'reason', label: 'Reason', kind: 'text', required: true }] });
  });

  it('accepts a dropdown whose options come from events, but not a fixed dropdown without options', async () => {
    await expect(customNodes.create('t', alertSpec(RAISE))).resolves.toMatchObject({ type: 'custom.raise-alert' });
    const fixedEmpty = alertSpec(RAISE);
    fixedEmpty.configSchema = [{ key: 'mode', label: 'Mode', kind: 'select' }];
    await expect(customNodes.create('t', fixedEmpty)).rejects.toThrow();
  });

  it('test runs report the events run() would emit, and reject malformed emits', async () => {
    const input = { config: { alertEvent: 'custom.high_value_alert', threshold: 100 }, shipment: { orderValue: 900 }, context: {}, trigger: { event: 'x' } };
    expect(await customNodes.test(alertSpec(RAISE), input)).toMatchObject({
      ok: true,
      result: { outputHandle: 'risky', emit: [{ event: 'custom.high_value_alert', payload: { reason: 'value 900' } }] },
    });
    const builtIn = await customNodes.test(alertSpec(`function run() { return { emit: { event: 'shipment.delivered' } }; }`), input);
    expect(builtIn).toMatchObject({ ok: false, error: expect.stringContaining('built-in') });
  });

  it('in a workflow, emits the chosen event for the shipment with the chain depth', async () => {
    const node = await customNodes.create('t', alertSpec(RAISE));
    const version = (await customNodes.resolveVersion('t', node.type))!;
    const { service: warehouses, delhi } = await warehouseFixture();
    shipments = new ShipmentService(new InMemoryShipments(), publisher, warehouses);
    events = new EventDefinitionService(new InMemoryEventDefinitions(), shipments, publisher);
    await events.create('t', { label: 'High value alert', description: '', payloadSchema: [{ key: 'reason', label: 'Reason', kind: 'text', required: true }] });
    const shipment = await shipments.create('t', shipmentInput(delhi.id, { orderValue: 5000 }), { triggered: true });

    const impl = new CustomWorkflowNode(version, sandbox, events);
    const ctx = {
      tenantId: 't',
      executionId: 'ex1',
      config: { alertEvent: 'custom.high_value_alert', threshold: 2000 },
      data: { shipment, context: {}, trigger: { event: 'shipment.created', data: { chainDepth: 1 } } },
      logger: { log: () => undefined },
    } as unknown as NodeExecutionContext;
    const result = await impl.execute(ctx);
    expect(result).toMatchObject({ outputHandle: 'risky', output: { emitted: ['custom.high_value_alert'] } });
    expect(publisher.events.at(-1)).toMatchObject({
      name: 'custom.high_value_alert',
      payload: { payload: { reason: 'value 5000' }, chainDepth: 2, source: 'workflow:ex1' },
    });

    await events.setArchived('t', (await events.list('t'))[0].id, true);
    await expect(impl.execute(ctx)).rejects.toBeInstanceOf(NonRetryableError);
  });
});
