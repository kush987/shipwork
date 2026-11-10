import type { StepLogic } from '../../workflow/domain/workflow-definition.types';

/**
 * One saved version of a workspace's changes to a built-in step. Only the changes are stored: the
 * step itself (its settings, paths and behaviour) comes from the app, so app updates still reach it.
 * Versions are never changed or deleted; "Reset to default" saves a version with no changes.
 */
export interface BuiltinNodeEdit {
  tenantId: string;
  /** The built-in step type, e.g. `data.query`. */
  type: string;
  version: number;
  label?: string;
  description?: string;
  icon?: string;
  /** Settings' defaults that differ from the app's: what a newly added step starts with. */
  defaults: Record<string, unknown>;
  /** before() / after() run on every use of the step in the workspace (pinned when a workflow publishes). */
  logic?: StepLogic;
  /** True for the version saved by "Reset to default". */
  reset: boolean;
  createdAt: string;
  createdBy: string | null;
}

/** What a workspace can change on a built-in step. Blank text means the app's own. */
export type BuiltinNodeEditInput = Partial<Pick<BuiltinNodeEdit, 'label' | 'description' | 'icon' | 'defaults' | 'logic'>>;
