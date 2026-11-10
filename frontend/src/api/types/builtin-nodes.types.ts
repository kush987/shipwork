import type { ConfigField, NodeCategory, NodeOutput } from './nodes.types';
import type { StepLogic } from './workflows.types';

/** One saved version of the workspace's changes to a built-in step (only what differs from the app). */
export interface BuiltinNodeEdit {
  type: string;
  version: number;
  label?: string;
  description?: string;
  icon?: string;
  /** Settings' defaults for newly added steps that differ from the app's. */
  defaults: Record<string, unknown>;
  /** before()/after() that runs on every use of the step in the workspace. */
  logic?: StepLogic;
  /** The version saved by "Reset to default". */
  reset: boolean;
  createdAt: string;
  createdBy: string | null;
}

/** GET /builtin-nodes — a built-in step as the workspace sees it. */
export interface BuiltinNodeView {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  /** The app's own name, description and icon. */
  base: { label: string; description: string; icon: string };
  edit: BuiltinNodeEdit | null;
  /** The latest version changes something (a reset version doesn't). */
  edited: boolean;
  logicAllowed: boolean;
  /** Why the step can't have workspace logic (triggers, Return response, Run code). */
  logicNote: string | null;
}

/** GET /builtin-nodes/:type */
export interface BuiltinNodeDetail extends BuiltinNodeView {
  settings: ConfigField[];
  outputs: NodeOutput[];
  history: { version: number; createdAt: string; createdBy: string | null; changes: string[] }[];
}

/** PUT /builtin-nodes/:type — what the step should look like now. Blank text means the app's own. */
export interface BuiltinNodeEditInput {
  label?: string;
  description?: string;
  icon?: string;
  defaults?: Record<string, unknown>;
  logic?: StepLogic;
}
