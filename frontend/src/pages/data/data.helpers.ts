import { omit, pick, uniq, without } from 'lodash-es';
import type { DataCollection, IndexKey, IndexOrder, IndexSpec, SourceRecord } from '../../api/types';
import { slugify } from '../../lib/format';
import { BUILTIN_COLUMNS, BUILTIN_FILTER_EXAMPLES, CELL_TEXT_MAX, COLLECTION_FILTER_EXAMPLE, MAX_COLUMNS, SYSTEM_FIELDS } from './data.constants';
import type { CollectionDraft, IndexDraft, RecordColumns, RecordsTarget } from './data.types';

/** A valid collection name derived from a label: "Product reviews" → "product_reviews". */
export const collectionNameFrom = (label: string) => slugify(label).replace(/^[^a-z]+/, '');

/** The editable copy of a collection (fields copied, so edits don't touch the cached one). */
export const toCollectionDraft = (c: DataCollection): CollectionDraft => ({
  ...pick(c, ['name', 'label', 'description']),
  fields: c.fields.map((f) => ({ ...f })),
});

/**
 * Columns for the records table: schema fields first (in schema order), then any other keys found on the
 * visible records, capped at MAX_COLUMNS. Returns the hidden count too.
 */
export function recordColumns(records: SourceRecord[], schemaKeys: string[]): RecordColumns {
  const recordKeys = records.flatMap((r) => Object.keys(r));
  const present = new Set(recordKeys);
  const known = schemaKeys.filter((k) => present.has(k) || records.length === 0);
  const keys = without(uniq([...known, ...recordKeys]), ...SYSTEM_FIELDS);
  return { columns: keys.slice(0, MAX_COLUMNS), hidden: Math.max(0, keys.length - MAX_COLUMNS) };
}

/** Columns for a collection (its schema, then whatever records hold) or a built-in source (a fixed set). */
export function columnsFor(target: RecordsTarget, records: SourceRecord[]): RecordColumns {
  if (target.kind === 'collection') return recordColumns(records, target.collection.fields.map((f) => f.key));
  const fixed = BUILTIN_COLUMNS[target.source.name] ?? without(uniq(target.source.fields.map((f) => f.key.split('.')[0])), ...SYSTEM_FIELDS);
  return { columns: fixed.slice(0, MAX_COLUMNS), hidden: 0 };
}

export const targetName = (target: RecordsTarget) => (target.kind === 'collection' ? target.collection.name : target.source.name);

/** Placeholder of the filter box: an example using fields the target actually has. */
export function filterExample(target: RecordsTarget): string {
  if (target.kind === 'collection') {
    const field = target.collection.fields[0];
    return field ? `{"${field.key}": ${field.type === 'number' ? '{"$gte": 1}' : '"…"'}}` : COLLECTION_FILTER_EXAMPLE;
  }
  return BUILTIN_FILTER_EXAMPLES[target.source.name] ?? `{"${target.source.fields[0]?.key ?? 'field'}": "…"}`;
}

/** Records can be sorted by age when they have a creation date (built-in couriers don't). */
export const isSortable = (target: RecordsTarget) => target.kind === 'collection' || target.source.fields.some((f) => f.key === 'createdAt');

/** The writable part of a record: drops the system fields (also any someone typed into the editor). */
export const withoutSystemFields = (fields: Record<string, unknown>): Record<string, unknown> => omit(fields, SYSTEM_FIELDS);

/** PATCH body turning `before` into `after`: changed / new fields, and `null` for removed ones. */
export function recordPatch(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) if (JSON.stringify(before[k]) !== JSON.stringify(v)) patch[k] = v;
  for (const k of Object.keys(before)) if (!(k in after)) patch[k] = null;
  return patch;
}

/** Short text for a table cell. */
export function cellText(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const json = JSON.stringify(v);
  return json.length > CELL_TEXT_MAX ? `${json.slice(0, CELL_TEXT_MAX - 3)}…` : json;
}

/** 1536 → "1.5 KB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 90 → "1.5 min", 86400 → "1 day". */
export function formatSeconds(seconds: number): string {
  const steps: [number, string][] = [
    [86400, 'day'],
    [3600, 'h'],
    [60, 'min'],
  ];
  for (const [size, unit] of steps) {
    if (seconds >= size) {
      const n = Math.round((seconds / size) * 10) / 10;
      return unit === 'day' ? `${n} day${n === 1 ? '' : 's'}` : `${n} ${unit}`;
    }
  }
  return `${seconds} s`;
}

/** An index's fields: "sellerId ↑, createdAt ↓", "title (text)". */
export const describeIndexKeys = (keys: IndexKey[]) =>
  keys.map((k) => (k.order === 'text' ? `${k.field} (text)` : `${k.field} ${k.order === -1 ? '↓' : '↑'}`)).join(', ');

/** The settings of an index form, as the API takes them; null when a key is still empty. */
export function toIndexSpec(draft: IndexDraft): IndexSpec | null {
  const keys = draft.keys.map((k) => ({ field: k.field.trim(), order: (k.order === 'text' ? 'text' : Number(k.order)) as IndexOrder }));
  if (!draft.name.trim() || !keys.length || keys.some((k) => !k.field)) return null;
  const ttl = draft.ttl.trim();
  return {
    name: draft.name.trim(),
    keys,
    ...(draft.unique ? { unique: true } : {}),
    ...(draft.sparse ? { sparse: true } : {}),
    ...(draft.partialFilter ? { partialFilter: draft.partialFilter } : {}),
    ...(ttl ? { expireAfterSeconds: Number(ttl) } : {}),
  };
}
