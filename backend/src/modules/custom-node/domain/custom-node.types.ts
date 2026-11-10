import type { ConfigField } from '../../nodes/domain/workflow-node.types';
import type { FieldSpec } from '../../../shared/schema/field-schema.types';

/**
 * How a node's `run()` hands back its work.
 * - 1 "classic": returns `{ outputHandle, output, context, emit }`.
 * - 2 "simple": returns the result itself (saved as `context.<Save result as>`); `branch()`,
 *   `emit()` and `fail()` helpers do the rest.
 * Versions saved before the simple format existed have no apiVersion and stay classic forever.
 */
export type CustomNodeApiVersion = 1 | 2;

/** One path the flow can take after the node ("Risky", "Safe"). Stored as `outputs`. */
export interface CustomNodeBranch {
  id: string;
  label: string;
}

/** Everything a user authors for a custom node. Each save becomes a new immutable version. */
export interface CustomNodeSpec {
  label: string;
  description: string;
  icon: string;
  /** Settings: the fields people fill in when they add the node to a workflow (`config.<key>`). */
  configSchema: ConfigField[];
  /** Branches the flow can continue from. */
  outputs: CustomNodeBranch[];
  /** JavaScript that defines `function run(input) { … }`. Runs in a QuickJS sandbox. */
  code: string;
  apiVersion?: CustomNodeApiVersion;
  /** Simple format: the default name the result is saved under (`context.<resultName>`). */
  resultName?: string;
  /** Simple format: the fields the result has — documents the node and feeds builder suggestions. */
  resultSchema?: FieldSpec[];
  /** Simple format: add a "Failed" branch so errors can be handled in the workflow. */
  errorBranch?: boolean;
}

export interface CustomNodeVersion extends CustomNodeSpec {
  customNodeId: string;
  tenantId: string;
  type: string;
  version: number;
  createdAt: string;
}

export interface CustomNode extends CustomNodeSpec {
  id: string;
  tenantId: string;
  /** `custom.<slug>` — what workflow definitions reference. Never changes after creation. */
  type: string;
  latestVersion: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A ready-made node to start from in the editor. */
export interface CustomNodeTemplate {
  id: string;
  name: string;
  summary: string;
  spec: CustomNodeSpec;
}

/** A custom event `run()` asked to send, after normalisation. */
export interface CustomNodeEmit {
  event: string;
  payload: Record<string, unknown>;
}

export interface CustomNodeResult {
  /** The branch to continue from. */
  outputHandle: string;
  /** Simple format: what run() returned. Classic: its `output`. */
  output: unknown;
  /** Classic only: keys merged into the context. Simple nodes save `output` under one name instead. */
  context: Record<string, unknown>;
  /** Custom events to send after the node succeeds (the code itself can't reach anything). */
  emit: CustomNodeEmit[];
}
