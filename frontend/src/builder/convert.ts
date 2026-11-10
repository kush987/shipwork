// Mapping between the API's workflow definition and React Flow's nodes and edges.
import type { WorkflowDefinition, WorkflowNodeDef } from '../api/types';
import { EDGE_DEFAULTS } from './builder.constants';
import { cleanLogic, hasLogic } from './builder.helpers';
import type { FlowEdge, FlowGraph, FlowNode, NodeCatalog, ToFlowOptions } from './builder.types';

export function toFlow(def: WorkflowDefinition, catalog: NodeCatalog, opts: ToFlowOptions = {}): FlowGraph {
  const nodes: FlowNode[] = def.nodes.map((n) => ({
    id: n.id,
    type: 'shipflow',
    position: n.position ?? { x: 0, y: 0 },
    data: {
      nodeType: n.type,
      name: n.name,
      config: n.config ?? {},
      def: catalog.get(n.type),
      readOnly: opts.readOnly,
      typeVersion: n.typeVersion,
      logic: n.logic,
    },
    deletable: !opts.readOnly,
  }));
  const edges: FlowEdge[] = def.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || 'default',
    ...EDGE_DEFAULTS,
    deletable: !opts.readOnly,
  }));
  return { nodes, edges };
}

export function fromFlow(nodes: FlowNode[], edges: FlowEdge[]): WorkflowDefinition {
  return {
    nodes: nodes.map<WorkflowNodeDef>((n) => ({
      id: n.id,
      type: n.data.nodeType,
      name: n.data.name,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      config: n.data.config,
      ...(n.data.typeVersion ? { typeVersion: n.data.typeVersion } : {}),
      ...(hasLogic(n.data.logic) ? { logic: cleanLogic(n.data.logic!) } : {}),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? 'default',
    })),
  };
}
