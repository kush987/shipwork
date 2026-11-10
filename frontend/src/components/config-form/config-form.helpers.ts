import { createElement } from 'react';
import type { ConfigField, DataSourceInfo, EventOption, Workflow } from '../../api/types';
import { HTTP_TRIGGER_EVENT } from '../../lib/endpoints.constants';
import { partition, upperFirst } from 'lodash-es';
import { ID_FIELD, SOURCE_CONFIG_KEY, SOURCE_GROUPS, TIMESTAMP_FIELDS, SYSTEM_SOURCE_PREFIX } from './config-form.constants';
import type { AuthProvidersState, CollectionsState, DataSourcesState, FieldWithHint, OptionRun, RuntimeLists, WorkflowsState } from './config-form.types';
import { NoCollectionsHint } from './NoCollectionsHint';
import { NoSigningProviderHint } from './NoSigningProviderHint';
import { SourceHint } from './SourceHint';
import { WorkflowHint } from './WorkflowHint';

/** Initial values of a set of settings: their defaults, false for switches and [] for multi-selects. */
export function defaultValues(fields: ConfigField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default !== undefined && f.default !== null) values[f.key] = f.default;
    else if (f.kind === 'boolean') values[f.key] = false;
    else if (f.kind === 'multiselect') values[f.key] = [];
  }
  return values;
}

/** Whether a setting shows, given the step's other settings (an unset one counts as its default). */
export function isVisible(f: ConfigField, values: Record<string, unknown>, fields: ConfigField[]): boolean {
  if (!f.visibleWhen) return true;
  const { key, values: shownFor } = f.visibleWhen;
  const current = values[key] ?? fields.find((other) => other.key === key)?.default;
  return shownFor.includes(String(current ?? ''));
}

const toEventOption = (e: EventOption) => ({ value: e.value, label: e.custom ? `${e.label} · custom` : e.label });

/**
 * Fills option lists loaded at runtime — all events (built-in + custom), only custom events, the tenant's
 * data collections, every data source (collections + built-in data), or the fields of the data chosen in
 * the same step (`values`) — and returns a hint to show instead of the field's own help (an empty list,
 * or what the chosen data source contains).
 */
export function withRuntimeOptions(
  f: ConfigField,
  value: unknown,
  events: EventOption[],
  lists: RuntimeLists,
  values: Record<string, unknown> = {},
): FieldWithHint {
  if (f.optionsSource === 'collections') return withCollectionOptions(f, value, lists.collections);
  if (f.optionsSource === 'data-sources') return withSourceOptions(f, value, lists.dataSources);
  if (f.optionsSource === 'source-fields') return withSourceFieldOptions(f, value, lists.dataSources, values[SOURCE_CONFIG_KEY]);
  if (f.optionsSource === 'workflows') return withWorkflowOptions(f, value, lists.workflows);
  if (f.optionsSource === 'auth-providers') return withProviderOptions(f, value, lists.authProviders);
  if (f.kind !== 'select' && f.kind !== 'multiselect') return { field: f };
  if (f.optionsSource === 'custom-events') {
    const custom = events.filter((e) => e.custom).map(toEventOption);
    return { field: { ...f, options: custom, help: custom.length ? f.help : 'No custom events yet — define one on the Events page' } };
  }
  if (f.optionsSource === 'events' || ((!f.options || f.options.length === 0) && /event/i.test(f.key))) {
    return { field: { ...f, options: events.map(toEventOption) } };
  }
  return { field: f };
}

/** "Products (products)", or just the name when the label adds nothing. */
export const labelWithName = (label: string, name: string) => (label && label !== name ? `${label} (${name})` : name);

/** Keeps a chosen value visible even if it no longer exists, so the setting isn't silently lost. */
function withMissingValue(options: NonNullable<ConfigField['options']>, value: unknown, loaded: boolean) {
  if (typeof value !== 'string' || !value || !loaded || options.some((o) => o.value === value)) return options;
  return [...options, { value, label: `${value} (not found)` }];
}

const asSelect = (f: ConfigField, options: NonNullable<ConfigField['options']>): ConfigField => ({
  ...f,
  kind: f.kind === 'multiselect' ? 'multiselect' : 'select',
  options,
});

function withCollectionOptions(f: ConfigField, value: unknown, c: CollectionsState): FieldWithHint {
  const options = (c.list ?? []).map((col) => ({ value: col.name, label: labelWithName(col.label, col.name) }));
  const field = asSelect(f, withMissingValue(options, value, !!c.list));
  if (c.loading) return { field, hint: 'Loading collections…' };
  if (c.failed) return { field, hint: 'Could not load collections.' };
  if (!c.list?.length) return { field, hint: createElement(NoCollectionsHint) };
  return { field };
}

/** Only ShipFlow-issued providers hold a key ShipFlow can sign tokens with. */
function withProviderOptions(f: ConfigField, value: unknown, p: AuthProvidersState): FieldWithHint {
  const signing = (p.list ?? []).filter((provider) => provider.type === 'shipflow');
  const field = asSelect(f, withMissingValue(signing.map((provider) => ({ value: provider.id, label: provider.name })), value, !!p.list));
  if (p.loading) return { field, hint: 'Loading sign-in providers…' };
  if (p.failed) return { field, hint: 'Could not load sign-in providers.' };
  if (!signing.length) return { field, hint: createElement(NoSigningProviderHint) };
  return { field };
}

/** Workflows another workflow can run: published, not archived, starting with an API request. */
export const isCallable = (w: Workflow) => w.status !== 'archived' && w.publishedVersion !== null && w.triggerEvent === HTTP_TRIGGER_EVENT;

function withWorkflowOptions(f: ConfigField, value: unknown, w: WorkflowsState): FieldWithHint {
  const callable = (w.list ?? []).filter(isCallable);
  // A chosen workflow that can't run yet (e.g. a template's part still a draft) keeps its name, so the step isn't "not found".
  const chosen = (w.list ?? []).find((x) => x.id === value && x.status !== 'archived');
  const options = callable.map((x) => ({ value: x.id, label: x.name }));
  if (chosen && !isCallable(chosen)) options.unshift({ value: chosen.id, label: `${chosen.name} — not published yet` });
  const field = asSelect(f, withMissingValue(options, value, !!w.list));
  if (w.loading) return { field, hint: 'Loading workflows…' };
  if (w.failed) return { field, hint: 'Could not load workflows.' };
  if (chosen) return { field, hint: createElement(WorkflowHint, { workflow: chosen }) };
  if (!callable.length) return { field, hint: 'No published workflow starts with an API request yet — publish one first.' };
  return { field };
}

/** Option for a data source, grouped into "Your collections" / "Built-in data (read-only)". */
export const sourceOption = (s: DataSourceInfo) => ({
  value: s.name,
  label: s.kind === 'system' ? s.label : labelWithName(s.label, s.name),
  group: SOURCE_GROUPS[s.kind],
});

function withSourceOptions(f: ConfigField, value: unknown, s: DataSourcesState): FieldWithHint {
  const field = asSelect(f, withMissingValue((s.list ?? []).map(sourceOption), value, !!s.list));
  if (s.loading) return { field, hint: 'Loading data sources…' };
  if (s.failed) return { field, hint: 'Could not load data sources.' };
  const chosen = s.list?.find((source) => source.name === value);
  return chosen ? { field, hint: createElement(SourceHint, { source: chosen }) } : { field };
}

/**
 * Suggestions for a "Find by" setting: the fields of the data chosen in the same step. Any name can still
 * be typed, since collections accept fields they don't describe. The hint says when a match may not be
 * the only one (the step then uses the newest).
 */
function withSourceFieldOptions(f: ConfigField, value: unknown, s: DataSourcesState, sourceName: unknown): FieldWithHint {
  const source = s.list?.find((candidate) => candidate.name === sourceName);
  if (!source) return { field: f, hint: sourceName ? undefined : 'Pick the data first, then the field to match' };
  const options = source.fields.map((x) => ({ value: x.key, label: x.unique ? `${x.type} · unique` : x.type }));
  const field: ConfigField = { ...f, options };
  const key = typeof value === 'string' && value.trim() ? value.trim() : ID_FIELD;
  const described = source.fields.find((x) => x.key === key);
  if (key === ID_FIELD || described?.unique) return { field };
  if (source.kind === 'system') {
    if (!described) return { field, hint: `${source.label} has no field “${key}”` };
    return { field, hint: `Several ${source.label.toLowerCase()} can share a “${key}” — the newest match is used.` };
  }
  return { field, hint: `Several records can share a “${key}” — the newest match is used. Mark the field unique on the Data page to rule that out.` };
}

/** Field names of a source for a one-line hint: the first few, and how many more there are. */
export function sourceFieldSummary(source: DataSourceInfo, max: number): { shown: string[]; more: number } {
  // Timestamps every record has are the least telling, so they go last.
  const [stamps, rest] = partition(source.fields.map((f) => f.key), (k) => TIMESTAMP_FIELDS.includes(k));
  const keys = [...rest, ...stamps];
  return { shown: keys.slice(0, max), more: Math.max(0, keys.length - max) };
}

/** Top-level keys of a source's records, from its (possibly dotted) field paths. */
export const sourceTopLevelKeys = (source: DataSourceInfo): string[] => [...new Set(source.fields.map((f) => f.key.split('.')[0]))];

/** Data page link that opens a source. */
export const sourceDataLink = (name: string) => `/data?c=${encodeURIComponent(name)}`;

/** Condition values are typed as text; keep numbers numeric so `> 2000` compares correctly. */
export function coerceText(v: string): unknown {
  if (v === '') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/** Text of a JSON config field: raw text stays as typed, values are pretty-printed. */
export const toEditableJson = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2));

/** Options in their order, split into runs by group (ungrouped options form a run with no group). */
export function optionGroups(options: NonNullable<ConfigField['options']>): OptionRun[] {
  const runs: OptionRun[] = [];
  for (const o of options) {
    const last = runs.at(-1);
    if (last && last.group === o.group) last.options.push(o);
    else runs.push({ group: o.group, options: [o] });
  }
  return runs;
}

/** `system.shipments` → `Shipments (built-in)`; collection names are returned as they are. */
export const dataSourceDisplayName = (name: string) =>
  name.startsWith(SYSTEM_SOURCE_PREFIX) ? `${upperFirst(name.slice(SYSTEM_SOURCE_PREFIX.length))} (built-in)` : name;
