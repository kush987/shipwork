import { isEqual } from 'lodash-es';
import type { BuiltinNodeDetail, BuiltinNodeEdit, BuiltinNodeEditInput, ConfigField, StepLogic } from '../../api/types';
import { defaultValues } from '../../components/config-form/config-form.helpers';
import { hasLogic } from '../../builder/builder.helpers';
import type { BuiltinNodeForm } from './customNodes.types';

const parsed = (v: unknown) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/** Same value for a setting; JSON settings compare as values whether written as text or not. */
const sameValue = (field: ConfigField, a: unknown, b: unknown) => (field.kind === 'json' ? isEqual(parsed(a), parsed(b)) : isEqual(a, b));

/** What the workspace changed on a built-in step, in a few words (nothing for a reset version). */
export function changeSummary(edit: BuiltinNodeEdit | null): string[] {
  if (!edit || edit.reset) return [];
  const defaults = Object.keys(edit.defaults).length;
  return [
    ...(edit.label ? ['name'] : []),
    ...(edit.description ? ['description'] : []),
    ...(edit.icon ? ['icon'] : []),
    ...(defaults ? [`${defaults} default${defaults === 1 ? '' : 's'}`] : []),
    ...(hasLogic(edit.logic) ? ['workspace logic'] : []),
  ];
}

const onlyCode = (logic: StepLogic | undefined): StepLogic =>
  Object.fromEntries(Object.entries(logic ?? {}).filter(([, code]) => typeof code === 'string' && code.trim())) as StepLogic;

/** The editor's starting point: the latest version's changes (none after a reset). */
export function formFrom(detail: BuiltinNodeDetail): BuiltinNodeForm {
  const edit = detail.edit && !detail.edit.reset ? detail.edit : null;
  return { label: edit?.label ?? '', description: edit?.description ?? '', icon: edit?.icon ?? '', defaults: edit?.defaults ?? {}, logic: onlyCode(edit?.logic) };
}

export const toInput = (form: BuiltinNodeForm): BuiltinNodeEditInput => ({
  label: form.label.trim(),
  description: form.description.trim(),
  icon: form.icon,
  defaults: form.defaults,
  logic: onlyCode(form.logic),
});

/** True when the form says the same as `other` (blank text, empty hooks and app-equal defaults count as unchanged). */
export const sameForm = (a: BuiltinNodeForm, b: BuiltinNodeForm) => isEqual(toInput(a), toInput(b));

/** What the default-settings form shows: the app's defaults with the workspace's on top. */
export const shownDefaults = (settings: ConfigField[], overrides: Record<string, unknown>) => ({ ...defaultValues(settings), ...overrides });

/** The workspace's defaults after one setting changed: kept only when it differs from the app's. */
export function withDefault(overrides: Record<string, unknown>, field: ConfigField, value: unknown): Record<string, unknown> {
  const next = { ...overrides };
  if (value === undefined || sameValue(field, value, field.default)) delete next[field.key];
  else next[field.key] = value;
  return next;
}
