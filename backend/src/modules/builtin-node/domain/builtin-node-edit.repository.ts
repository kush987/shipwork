import type { BuiltinNodeEdit } from './builtin-node-edit.types';

/** Versions of workspaces' changes to built-in steps (append-only). */
export abstract class BuiltinNodeEditRepository {
  /** Saves a new version; false when that version number was taken meanwhile. */
  abstract create(edit: BuiltinNodeEdit): Promise<boolean>;
  abstract latest(tenantId: string, type: string): Promise<BuiltinNodeEdit | null>;
  /** The latest version of every built-in step the workspace has changed. */
  abstract latestAll(tenantId: string): Promise<BuiltinNodeEdit[]>;
  abstract find(tenantId: string, type: string, version: number): Promise<BuiltinNodeEdit | null>;
  /** Every version of one step, newest first. */
  abstract history(tenantId: string, type: string): Promise<BuiltinNodeEdit[]>;
}
