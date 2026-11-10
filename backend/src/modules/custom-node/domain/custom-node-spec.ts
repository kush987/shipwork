import { fieldSpecIssues } from '../../../shared/schema/field-schema';
import { IDENTIFIER, RESERVED_CONTEXT_KEYS } from '../../nodes/domain/node-config.constants';
import type { ConfigField } from '../../nodes/domain/workflow-node.types';
import type { ValidationIssue } from '../../../shared/domain/errors.types';
import {
  API_VERSIONS,
  BRANCH_ID,
  FAILED_BRANCH,
  MAX_BRANCHES,
  MAX_CODE_CHARS,
  MAX_RESULT_FIELDS,
  MAX_SETTINGS,
  SAVE_AS_SETTING_KEY,
  SETTING_KEY,
  SETTING_KINDS,
} from './custom-node.constants';
import { isSimpleFormat } from './custom-node';
import type { CustomNodeBranch, CustomNodeSpec } from './custom-node.types';

const isList = (field: ConfigField) => field.kind === 'select' || field.kind === 'multiselect';

/** Every problem with one setting, named so the user can find it ("Setting "threshold" …"). */
export function settingIssues(field: ConfigField, simple: boolean): string[] {
  const name = field.key || field.label || '(unnamed)';
  const issues: string[] = [];
  if (!SETTING_KEY.test(field.key ?? '')) issues.push(`Setting key "${field.key}" must be a letter followed by letters, digits or _`);
  if (simple && field.key === SAVE_AS_SETTING_KEY) issues.push(`Setting key "${SAVE_AS_SETTING_KEY}" is reserved for "Save result as"`);
  if (!field.label?.trim()) issues.push(`Setting "${name}" needs a label`);
  if (!(SETTING_KINDS as readonly string[]).includes(field.kind)) issues.push(`Setting "${name}" has an unknown type "${field.kind}"`);
  if (field.optionsSource && !isList(field)) issues.push(`Setting "${name}" can only load events as options when it is a dropdown`);
  if (!isList(field) || field.optionsSource) return issues;

  const options = field.options ?? [];
  if (!options.length) issues.push(`Setting "${name}" needs at least one option`);
  const values = options.map((o) => String(o.value ?? '').trim());
  if (values.some((v) => !v)) issues.push(`Setting "${name}" has an option without a value`);
  if (new Set(values).size !== values.length) issues.push(`Setting "${name}" lists the same option value twice`);
  // A default the dropdown can't show would silently be sent to run() anyway.
  const defaults = field.default === undefined || field.default === null || field.default === '' ? [] : [field.default].flat();
  const unknown = defaults.filter((d) => !values.includes(String(d)));
  if (unknown.length) issues.push(`Setting "${name}": default "${unknown.join(', ')}" is not one of its options`);
  return issues;
}

export function branchIssues(branches: CustomNodeBranch[], simple: boolean): string[] {
  const issues: string[] = [];
  if (!branches.length) issues.push('Add at least one branch');
  if (branches.length > MAX_BRANCHES) issues.push(`A node can have at most ${MAX_BRANCHES} branches`);
  const seen = new Set<string>();
  for (const { id, label } of branches) {
    if (!BRANCH_ID.test(id ?? '')) issues.push(`Branch id "${id}" must be lowercase letters, digits, - or _`);
    if (simple && id === FAILED_BRANCH.id) issues.push(`Branch id "${FAILED_BRANCH.id}" is reserved — turn on "Failed branch" instead`);
    if (seen.has(id)) issues.push(`Branch id "${id}" is used twice`);
    if (simple && !label?.trim()) issues.push(`Branch "${id}" needs a label`);
    seen.add(id);
  }
  return issues;
}

export function resultIssues(spec: Pick<CustomNodeSpec, 'resultName' | 'resultSchema'>): string[] {
  const issues: string[] = [];
  const name = spec.resultName?.trim();
  if (name && !IDENTIFIER.test(name)) issues.push('Result name must be a letter followed by letters, digits or _');
  if (name && RESERVED_CONTEXT_KEYS.includes(name)) issues.push(`Result name "${name}" is used by built-in steps — pick another`);
  const fields = spec.resultSchema ?? [];
  if (fields.length > MAX_RESULT_FIELDS) issues.push(`Describe at most ${MAX_RESULT_FIELDS} result fields`);
  issues.push(...fieldSpecIssues(fields).map((issue) => `Result: ${issue}`));
  return issues;
}

/** Everything wrong with a node definition, without running its code. */
export function customNodeSpecIssues(spec: CustomNodeSpec): ValidationIssue[] {
  const simple = isSimpleFormat(spec);
  const issues: string[] = [];
  if (spec.apiVersion !== undefined && !API_VERSIONS.includes(spec.apiVersion)) issues.push(`Unknown format version ${spec.apiVersion}`);

  const keys = new Set<string>();
  for (const field of spec.configSchema) {
    issues.push(...settingIssues(field, simple));
    if (keys.has(field.key)) issues.push(`Setting key "${field.key}" is used twice`);
    keys.add(field.key);
  }
  if (spec.configSchema.length > MAX_SETTINGS) issues.push(`A node can have at most ${MAX_SETTINGS} settings`);

  issues.push(...branchIssues(spec.outputs, simple));
  if (simple) issues.push(...resultIssues(spec));

  issues.push(...codeIssues(spec.code));
  return issues.map((message) => ({ message }));
}

export function codeIssues(code: string): string[] {
  if (!code?.trim()) return ['Code is empty'];
  if (code.length > MAX_CODE_CHARS) return [`Code is longer than ${MAX_CODE_CHARS.toLocaleString()} characters`];
  return [];
}
