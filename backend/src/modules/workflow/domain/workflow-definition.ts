import { WorkflowDefinition } from './workflow-definition.types';

export const findTriggerNode = (def: WorkflowDefinition, isTrigger: (type: string) => boolean) =>
  def.nodes.find((n) => isTrigger(n.type));

export const outgoingEdges = (def: WorkflowDefinition, nodeId: string, handle?: string) =>
  def.edges.filter((e) => e.source === nodeId && (handle === undefined || (e.sourceHandle || 'default') === handle));

/** Drafts always run the latest version of each custom node; only publishing pins versions. */
export const unpinCustomNodes = (def: WorkflowDefinition): WorkflowDefinition => ({
  ...def,
  nodes: def.nodes.map(({ typeVersion, ...node }) => node),
});

/** Keeps only logic hooks that hold code (forms send empty ones as null); no code → no `logic`. */
export const withoutEmptyLogic = (def: WorkflowDefinition): WorkflowDefinition => ({
  ...def,
  nodes: def.nodes.map(({ logic, ...node }) => {
    const kept = Object.fromEntries(Object.entries(logic ?? {}).filter(([, code]) => typeof code === 'string' && code.trim()));
    return Object.keys(kept).length ? { ...node, logic: kept } : node;
  }),
});
