import { WorkflowValidator } from './workflow-validator';
import type { NodeTypeDefinition } from '../../nodes/domain/workflow-node.types';
import { WorkflowDefinition } from './workflow-definition.types';
import { NodeCatalog } from './workflow-validator.types';

const def = (type: string, extra: Partial<NodeTypeDefinition> = {}): NodeTypeDefinition => ({
  type,
  category: 'logic',
  label: type,
  description: '',
  icon: 'x',
  configSchema: [],
  outputs: [{ id: 'default', label: '' }],
  ...extra,
});

const types: Record<string, NodeTypeDefinition> = {
  'trigger.event': def('trigger.event', {
    isTrigger: true,
    configSchema: [{ key: 'event', label: 'Event', kind: 'select', required: true }],
  }),
  'logic.condition': def('logic.condition', { outputs: [{ id: 'true', label: '' }, { id: 'false', label: '' }] }),
  'shipment.tag': def('shipment.tag'),
};
const catalog: NodeCatalog = { get: (type) => (types[type] ? { definition: types[type] } : undefined) };
const validator = new WorkflowValidator(catalog);

const n = (id: string, type: string, config: Record<string, unknown> = {}) => ({
  id,
  type,
  name: id,
  position: { x: 0, y: 0 },
  config,
});
const e = (source: string, target: string, sourceHandle = 'default') => ({ id: `${source}-${target}`, source, target, sourceHandle });

const valid = (): WorkflowDefinition => ({
  nodes: [n('t', 'trigger.event', { event: 'shipment.created' }), n('c', 'logic.condition'), n('a', 'shipment.tag'), n('b', 'shipment.tag')],
  edges: [e('t', 'c'), e('c', 'a', 'true'), e('c', 'b', 'false')],
});

const messages = (d: WorkflowDefinition) => validator.validate(d).map((i) => i.message);

describe('WorkflowValidator', () => {
  it('accepts a well-formed graph', () => {
    expect(validator.validate(valid())).toEqual([]);
  });

  it('requires exactly one trigger', () => {
    const d = valid();
    d.nodes.shift();
    d.edges.shift();
    expect(messages(d)).toContain('Add a trigger node to start the workflow');
  });

  it('flags missing required config', () => {
    const d = valid();
    d.nodes[0].config = {};
    expect(messages(d)).toContain('t: "Event" is required');
  });

  it('flags unknown node types and output handles', () => {
    const d = valid();
    d.nodes.push(n('x', 'nope'));
    d.edges.push(e('t', 'x'), { ...e('c', 'a'), id: 'bad', sourceHandle: 'maybe' });
    const issues = messages(d);
    expect(issues).toContain("Unknown node type 'nope'");
    expect(issues).toContain("Unknown output 'maybe'");
  });

  it('flags nodes not reachable from the trigger', () => {
    const d = valid();
    d.nodes.push(n('orphan', 'shipment.tag'));
    expect(messages(d)).toContain('"orphan" is not connected to the trigger');
  });

  it('rejects cycles', () => {
    const d = valid();
    d.edges.push(e('a', 'c'));
    expect(messages(d)).toContain('Workflow contains a loop; connections must flow one way');
  });

  it('rejects edges into the trigger', () => {
    const d = valid();
    d.edges.push(e('a', 't'));
    expect(messages(d)).toContain('Triggers cannot have incoming connections');
  });
});
