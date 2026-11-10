import { hasStepLogic } from './step-logic';
import type { BuiltinNodeEdit } from '../../builtin-node/domain/builtin-node-edit.types';
import type { NodeTypeDefinition } from './workflow-node.types';

/** True when a version changes anything (a reset, or a save that set everything back, doesn't). */
export const hasChanges = (edit: Pick<BuiltinNodeEdit, 'label' | 'description' | 'icon' | 'defaults' | 'logic' | 'reset'>): boolean =>
  !edit.reset && !!(edit.label || edit.description || edit.icon || Object.keys(edit.defaults ?? {}).length || hasStepLogic(edit.logic));

/**
 * A built-in step as the workspace sees it: the app's definition with the workspace's name,
 * description, icon and setting defaults on top, and a note of its workspace logic. Behaviour,
 * settings and paths stay the app's.
 */
export function appliedEdit(def: NodeTypeDefinition, edit: BuiltinNodeEdit | null | undefined): NodeTypeDefinition {
  if (!edit || !hasChanges(edit)) return def;
  return {
    ...def,
    label: edit.label ?? def.label,
    description: edit.description ?? def.description,
    icon: edit.icon ?? def.icon,
    configSchema: def.configSchema.map((f) => (f.key in edit.defaults ? { ...f, default: edit.defaults[f.key] } : f)),
    edit: { version: edit.version, logic: hasStepLogic(edit.logic) },
  };
}
