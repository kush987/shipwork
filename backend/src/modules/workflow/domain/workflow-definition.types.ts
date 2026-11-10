export interface WorkflowNodeDef {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  /** Custom nodes only: the definition version to run. Set when a workflow is published. */
  typeVersion?: number;
  /** Your own code around a built-in step: change its settings before it runs, or its result after. */
  logic?: StepLogic;
}

/**
 * Code that changes how a built-in step behaves. Runs in the sandbox (no network, files or timers).
 * - `function before({ settings, request, context, trigger, shipment })` returns settings to use
 *   instead (only the keys it returns), or calls `respond(status, body)` to answer and skip the step.
 * - `function after({ result, path, settings, request, context, trigger, shipment })` returns what
 *   the step saves instead, `branch('path', result)` picks another path, `respond()` answers and stops.
 * Both may `fail('message')`.
 */
export interface StepLogic {
  before?: string;
  after?: string;
}

export interface WorkflowEdgeDef {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
}

/** The persisted graph. It is data, never code — the engine interprets it node by node. */
export interface WorkflowDefinition {
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdgeDef[];
}
