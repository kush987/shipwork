import { camelCase, countBy, isNil, isPlainObject, omitBy, pick } from 'lodash-es';
import type { ConfigField, CustomNodeSpec, EventOption, FieldSpec, NodeOutput } from '../../api/types';
import { SAVE_AS_KEY } from '../../components/config-form/config-form.constants';
import { defaultValues } from '../../components/config-form/config-form.helpers';
import { cleanSchema } from '../../components/SchemaFieldsEditor.helpers';
import { sampleShipment, slugify } from '../../lib/format';
import {
  BASE_SPEC_KEYS,
  BRANCH_ID_RE,
  DATA_SNIPPETS,
  FAILED_BRANCH,
  IDENTIFIER_RE,
  JS_RESERVED,
  KIND_LABEL,
  MAX_RESULT_PATHS,
  RESERVED_CONTEXT_KEYS,
  SAMPLE_CONTEXT,
  SAMPLE_LITERAL,
  SAMPLE_REQUEST,
  SAMPLE_SHIPMENT_STATE,
  SAMPLE_TRIGGER,
  SIMPLE_API,
} from './customNodes.constants';
import type { LockedNames, OptionSource, SampleData, SettingKind, SettingOption, SnippetGroup } from './customNodes.types';

// ---------------------------------------------------------------------------
// Names derived from labels
// ---------------------------------------------------------------------------

/** "COD threshold (₹)" → "codThreshold": a setting key / result name that code can use. */
export function toIdentifier(label: string): string {
  const id = camelCase(label).replace(/[^A-Za-z0-9_]/g, '');
  return (/^\d/.test(id) ? `_${id}` : id).slice(0, 40);
}

/** "Not valid" → "not_valid": a branch id. */
export const toBranchId = (label: string) => slugify(label).slice(0, 32);

/** "Express delivery" → "express_delivery": a dropdown option value. */
export const toOptionValue = (label: string) => slugify(label);

/** Default result name for a node: its name in camelCase, never a key built-in steps write. */
export function defaultResultName(label: string): string {
  const name = toIdentifier(label) || 'result';
  return RESERVED_CONTEXT_KEYS.includes(name) ? `${name}Result` : name;
}

/** True while a derived name still matches its label, so it should keep following label edits. */
export const followsLabel = (current: string | undefined, label: string, derive: (l: string) => string) => !current || current === derive(label);

// ---------------------------------------------------------------------------
// Spec shape
// ---------------------------------------------------------------------------

export const isClassic = (spec: Pick<CustomNodeSpec, 'apiVersion'>) => (spec.apiVersion ?? 1) !== SIMPLE_API;

/** Drops the nulls stored for unset optional fields (help: null, options: null…). */
const cleanField = (f: ConfigField): ConfigField => omitBy(f, isNil) as unknown as ConfigField;

/**
 * The editable spec of a node or template: only spec keys, no nulls, and the simple-format fields filled in
 * (classic nodes keep none of them, so saving one sends back exactly what it had).
 */
export function toEditableSpec(source: CustomNodeSpec): CustomNodeSpec {
  const base = { ...pick(source, BASE_SPEC_KEYS), configSchema: (source.configSchema ?? []).map(cleanField), outputs: source.outputs ?? [] } as CustomNodeSpec;
  if (isClassic(source)) return base;
  return {
    ...base,
    apiVersion: SIMPLE_API,
    resultName: source.resultName || defaultResultName(source.label),
    resultSchema: (source.resultSchema ?? []).map((f) => omitBy(f, isNil) as unknown as FieldSpec),
    errorBranch: !!source.errorBranch,
  };
}

/** Converts a classic node: run() must then return its result and pick branches with branch(). */
export const toSimpleFormat = (spec: CustomNodeSpec): CustomNodeSpec =>
  toEditableSpec({ ...spec, apiVersion: SIMPLE_API, resultName: defaultResultName(spec.label), resultSchema: [], errorBranch: false });

/** What is sent on save: trimmed keys, no empty help/placeholder texts. */
export function toSaveableSpec(spec: CustomNodeSpec): CustomNodeSpec {
  const configSchema = spec.configSchema.map((f) =>
    omitBy({ ...f, key: f.key.trim(), label: f.label.trim() }, (v, k) => isNil(v) || ((k === 'help' || k === 'placeholder') && v === '')),
  ) as unknown as ConfigField[];
  const outputs = spec.outputs.map((o) => ({ id: o.id.trim(), label: o.label.trim() }));
  const out = { ...spec, label: spec.label.trim(), configSchema, outputs };
  if (out.resultSchema) out.resultSchema = cleanSchema(out.resultSchema);
  if (out.resultName) out.resultName = out.resultName.trim();
  return out;
}

/** Names existing workflows depend on, taken from the saved version (nothing is locked for a new node). */
export const lockedNamesOf = (saved: CustomNodeSpec | null): LockedNames => ({
  settingKeys: saved?.configSchema.map((f) => f.key) ?? [],
  branchIds: saved?.outputs.map((o) => o.id) ?? [],
  resultName: !!saved?.resultName,
});

/** The automatic "Save result as" setting, as the backend appends it to simple-format nodes. */
export const saveAsField = (resultName: string): ConfigField => ({
  key: SAVE_AS_KEY,
  label: 'Save result as',
  kind: 'text',
  default: resultName,
  required: true,
  help: 'Next steps read it as context.<name>',
});

/** The settings exactly as the workflow builder shows them for this node. */
export const builderFields = (spec: CustomNodeSpec): ConfigField[] =>
  isClassic(spec) ? spec.configSchema : [...spec.configSchema, saveAsField(spec.resultName || defaultResultName(spec.label))];

/** The branches the builder shows: the node's own, plus Failed when errors are caught. */
export const builderBranches = (spec: CustomNodeSpec): NodeOutput[] =>
  !isClassic(spec) && spec.errorBranch ? [...spec.outputs, FAILED_BRANCH] : spec.outputs;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const isListKind = (kind: ConfigField['kind']) => kind === 'select' || kind === 'multiselect';

export const optionSourceOf = (f: ConfigField): OptionSource => (f.optionsSource === 'events' || f.optionsSource === 'custom-events' ? f.optionsSource : '');

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/** "Number · required · default 2000" */
export function settingSummary(f: ConfigField): string {
  const parts = [KIND_LABEL[f.kind] ?? f.kind];
  if (isListKind(f.kind)) {
    const source = optionSourceOf(f);
    parts.push(source === 'events' ? 'all events' : source === 'custom-events' ? 'custom events' : `${f.options?.length ?? 0} options`);
  }
  if (f.required) parts.push('required');
  if (hasValue(f.default)) {
    const shown = typeof f.default === 'string' ? f.default : JSON.stringify(f.default);
    parts.push(`default ${shown.length > 24 ? `${shown.slice(0, 24)}…` : shown}`);
  }
  return parts.join(' · ');
}

/** `base`, or `base2`, `base3`… — the first one not in `taken`. */
export function uniqueName(base: string, taken: string[]): string {
  let name = base;
  for (let n = 2; taken.includes(name); n++) name = `${base}${n}`;
  return name;
}

/** A copy of a setting placed under a key no other setting uses. */
export const duplicateSetting = (f: ConfigField, taken: string[]): ConfigField => ({
  ...structuredClone(f),
  key: uniqueName(f.key || 'setting', taken),
  label: f.label ? `${f.label} (copy)` : '',
});

/** A new, empty setting whose key follows its label. */
export const newSetting = (): ConfigField => ({ key: '', label: '', kind: 'text', required: false });

/** Changes a setting's type, keeping what still makes sense (options between list types, nothing else). */
export function changeKind(f: ConfigField, kind: SettingKind): ConfigField {
  if (kind === f.kind) return f;
  const { options, optionsSource, default: def, placeholder, ...rest } = f;
  const next: ConfigField = { ...rest, kind };
  if (isListKind(kind)) {
    if (isListKind(f.kind)) {
      if (optionsSource) next.optionsSource = optionsSource;
      else next.options = options ?? [];
      // One value ↔ a list of values.
      if (kind === 'multiselect' && hasValue(def)) next.default = [def];
      if (kind === 'select' && Array.isArray(def) && def.length) next.default = def[0];
    } else {
      next.options = [];
    }
  }
  if (kind !== 'boolean' && kind !== 'multiselect' && placeholder) next.placeholder = placeholder;
  return next;
}

/** Switches a dropdown between a fixed list and events loaded by the builder. */
export function changeOptionSource(f: ConfigField, source: OptionSource): ConfigField {
  const { options, optionsSource, default: _def, ...rest } = f;
  return source ? { ...rest, optionsSource: source } : { ...rest, options: options ?? [] };
}

/** Problems with each setting, by index; a save would fail (or the setting misbehave) until they're fixed. */
export function settingProblems(settings: ConfigField[], classic: boolean): string[][] {
  const keyCounts = countBy(settings.map((f) => f.key.trim()));
  return settings.map((f) => {
    const problems: string[] = [];
    const key = f.key.trim();
    if (!f.label.trim()) problems.push('Give it a label');
    if (!key) problems.push('It needs a key');
    else if (!IDENTIFIER_RE.test(key)) problems.push('The key must start with a letter and use only letters, digits or _');
    else if (keyCounts[key] > 1) problems.push(`Another setting also uses the key “${key}”`);
    if (!classic && key === SAVE_AS_KEY) problems.push(`“${SAVE_AS_KEY}” is reserved for “Save result as” — pick another key`);
    if (isListKind(f.kind) && !optionSourceOf(f)) problems.push(...optionProblems(f));
    return problems;
  });
}

function optionProblems(f: ConfigField): string[] {
  const options = f.options ?? [];
  const problems: string[] = [];
  if (!options.length) problems.push('Add at least one option');
  if (options.some((o) => !o.value.trim())) problems.push('Every option needs a value');
  const dup = Object.entries(countBy(options.map((o) => o.value.trim()))).find(([v, n]) => v && n > 1);
  if (dup) problems.push(`The option value “${dup[0]}” is listed twice`);
  const values = new Set(options.map((o) => o.value));
  const defaults = Array.isArray(f.default) ? f.default : hasValue(f.default) ? [f.default] : [];
  if (defaults.some((d) => !values.has(String(d)))) problems.push('The default isn’t one of the options');
  return problems;
}

/** Adds an option whose value follows its label. */
export const newOption = (): SettingOption => ({ value: '', label: '' });

// ---------------------------------------------------------------------------
// Output: branches and result
// ---------------------------------------------------------------------------

/** Problems with each branch, by index. */
export function branchProblems(branches: NodeOutput[], classic: boolean): string[][] {
  const idCounts = countBy(branches.map((b) => b.id));
  return branches.map((b) => {
    const problems: string[] = [];
    if (!b.label.trim()) problems.push('Give it a label');
    if (!BRANCH_ID_RE.test(b.id)) problems.push('The id must be lowercase letters, digits, - or _');
    else if (idCounts[b.id] > 1) problems.push(`Another branch also uses the id “${b.id}”`);
    if (!classic && b.id === FAILED_BRANCH.id) problems.push('“failed” is reserved — turn on “Add a Failed branch” instead');
    return problems;
  });
}

/** "3 branches", or "no branching" for a node that always continues. */
export const branchesLabel = (count: number) => (count > 1 ? `${count} branches` : 'no branching');

/** Problem with the result name, if any. */
export function resultNameProblem(name: string): string | undefined {
  if (!name.trim()) return 'It needs a name';
  if (!IDENTIFIER_RE.test(name)) return 'Start with a letter and use only letters, digits or _';
  if (RESERVED_CONTEXT_KEYS.includes(name)) return `“${name}” is written by built-in steps — pick another name`;
  return undefined;
}

/** `{{context.totals.total}}`-style paths for a test result: top-level keys and one level below. */
export function resultPaths(saveAs: string, output: unknown): string[] {
  const root = `context.${saveAs || 'result'}`;
  if (!isPlainObject(output)) return [root];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(output as Record<string, unknown>)) {
    paths.push(`${root}.${key}`);
    if (isPlainObject(value)) paths.push(...Object.keys(value as object).map((k) => `${root}.${key}.${k}`));
  }
  return (paths.length ? paths : [root]).slice(0, MAX_RESULT_PATHS);
}

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

/** A run() skeleton from the node's settings, result fields and branches. */
export function starterCode(spec: CustomNodeSpec): string {
  const keys = spec.configSchema.map((f) => f.key.trim()).filter((k) => IDENTIFIER_RE.test(k) && !JS_RESERVED.has(k));
  const fields = (spec.resultSchema ?? []).filter((f) => IDENTIFIER_RE.test(f.key));
  const [first, ...others] = spec.outputs;
  const name = spec.resultName || defaultResultName(spec.label);
  const lines = [
    '// Runs each time a workflow reaches this node.',
    `// Whatever run() returns is saved as context.${name} — later steps read {{context.${name}.<field>}}.`,
    '// Helpers: branch(\'id\', result) · emit(\'custom.event\', payload) · fail(\'message\') · console.log()',
    'function run({ config, request, context, shipment }) {',
  ];
  if (keys.length) lines.push(`  const { ${keys.join(', ')} } = config;`, '');
  lines.push('  // TODO: your logic', '  const result = {');
  if (fields.length) fields.forEach((f) => lines.push(`    ${f.key}: ${SAMPLE_LITERAL[f.type] ?? 'null'},${f.description ? ` // ${f.description}` : ''}`));
  else lines.push('    ok: true,');
  lines.push('  };');
  if (others.length && first) {
    lines.push('');
    others.forEach((b) => lines.push(`  if (false /* when to continue on “${b.label || b.id}” */) return branch('${b.id}', result);`));
    lines.push(`  return branch('${first.id}', result);`);
  } else {
    lines.push('  return result;');
  }
  lines.push('}', '');
  return lines.join('\n');
}

/** What the code reference offers to type into the editor. */
export function codeSnippets(spec: CustomNodeSpec): SnippetGroup[] {
  const settings: SnippetGroup = {
    title: 'Settings',
    hint: spec.configSchema.length ? undefined : 'Add settings in step 2 to read them here.',
    items: spec.configSchema
      .filter((f) => f.key.trim())
      .map((f) => ({ label: `config.${f.key}`, insert: `config.${f.key}`, meta: KIND_LABEL[f.kind]?.toLowerCase(), title: f.label })),
  };
  const data: SnippetGroup = { title: 'Data', items: DATA_SNIPPETS };
  if (isClassic(spec)) {
    return [
      settings,
      data,
      {
        title: 'Return (classic format)',
        items: [
          {
            label: 'return { outputHandle, … }',
            insert: `return {\n    outputHandle: '${spec.outputs[0]?.id ?? 'id'}',\n    output: {},\n    context: {},\n  };`,
            title: 'outputHandle picks the branch, output shows in the timeline, context is merged for later steps',
          },
          { label: 'console.log(value)', insert: 'console.log();', title: 'Shows in the run timeline' },
        ],
      },
    ];
  }
  const branches = spec.outputs.length > 1 ? spec.outputs.map((b) => ({ label: `branch('${b.id}', result)`, insert: `return branch('${b.id}', result);`, meta: b.label, title: `Continue on “${b.label || b.id}”` })) : [];
  return [
    settings,
    data,
    {
      title: 'Helpers',
      items: [
        ...branches,
        { label: "fail('reason')", insert: "fail('Explain what went wrong');", title: spec.errorBranch ? 'Stops the node; the flow continues on Failed' : 'Stops the node and fails the run' },
        { label: "emit('custom.event', {…})", insert: "emit('custom.my_event', { reason: '' });", title: 'Raises one of your custom events after the step succeeds (needs a shipment: a shipment event, or a Use shipment step first)' },
        { label: 'console.log(value)', insert: 'console.log();', title: 'Shows in the run timeline' },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

/** Setting values for a test: defaults, and a real event for event dropdowns without one. */
export function testDefaults(fields: ConfigField[], events: EventOption[]): Record<string, unknown> {
  const values = defaultValues(fields);
  for (const f of fields) {
    if (!f.optionsSource || hasValue(values[f.key])) continue;
    const first = events.find((e) => f.optionsSource === 'events' || e.custom)?.value;
    if (first) values[f.key] = f.kind === 'multiselect' ? [first] : first;
  }
  return values;
}

/** Sample request, shipment, context and trigger for a test run. */
export function sampleData(): SampleData {
  const s = sampleShipment();
  return {
    request: SAMPLE_REQUEST,
    shipment: { ...s, ...SAMPLE_SHIPMENT_STATE, deliveryPincode: s.shippingAddress.pincode },
    context: SAMPLE_CONTEXT,
    trigger: SAMPLE_TRIGGER,
  };
}
