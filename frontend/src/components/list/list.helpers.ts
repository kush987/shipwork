import { DAY_MS, FIRST_DIR, OPERATORS, PARAM } from './list.constants';
import type { Condition, FieldValue, ListConfig, ListField, ListState, ListStateChange, MatchMode, Operator, SortState } from './list.types';

const isBlank = (v: FieldValue) => v === null || v === undefined || v === '';

/** An operator that compares with a value, still waiting for one: it doesn't filter yet. */
export function isIncomplete(c: Condition, field: ListField<unknown> | undefined): boolean {
  if (!field) return true;
  const spec = OPERATORS[field.kind].find((o) => o.op === c.op);
  return !spec || (spec.needsValue && c.value.trim() === '');
}

/** A date typed as YYYY-MM-DD means the start of that day, in the viewer's time zone. */
const dayStart = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : Date.parse(value);
};

function matches(op: Operator, raw: FieldValue, value: string, kind: ListField<unknown>['kind'], now: number): boolean {
  if (op === 'empty') return isBlank(raw);
  if (op === 'not_empty') return !isBlank(raw);
  if (kind === 'number') {
    if (isBlank(raw)) return op === 'neq';
    const n = Number(raw);
    const v = Number(value);
    if (Number.isNaN(v)) return true;
    return { eq: n === v, neq: n !== v, gt: n > v, gte: n >= v, lt: n < v, lte: n <= v }[op as 'eq'] ?? true;
  }
  if (kind === 'date') {
    if (isBlank(raw)) return false;
    const t = Date.parse(String(raw));
    if (op === 'within_days') return Number(value) >= 0 && t >= now - Number(value) * DAY_MS;
    const at = dayStart(value);
    if (Number.isNaN(at)) return true;
    if (op === 'after') return t >= at + DAY_MS; // after that whole day
    if (op === 'before') return t < at;
    return true;
  }
  const text = String(raw ?? '').toLowerCase();
  const want = value.trim().toLowerCase();
  if (kind === 'enum') return op === 'is_not' ? String(raw ?? '') !== value : String(raw ?? '') === value;
  switch (op) {
    case 'contains':
      return text.includes(want);
    case 'not_contains':
      return !text.includes(want);
    case 'is':
      return text === want;
    case 'is_not':
      return text !== want;
    case 'starts_with':
      return text.startsWith(want);
    default:
      return true;
  }
}

/** An enum's value as people read it (its option label), so sorting follows what the column shows. */
const sortKey = <T,>(field: ListField<T>, row: T): FieldValue => {
  const v = field.get(row);
  if (field.kind === 'date') return isBlank(v) ? null : Date.parse(String(v));
  if (field.kind === 'enum' && field.options) return field.options.find((o) => o.value === String(v))?.label ?? (isBlank(v) ? null : String(v));
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compare(a: FieldValue, b: FieldValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/** Searches, filters and sorts `rows` as the state says. Empty values sort last in both directions. */
export function applyList<T>(rows: T[], config: ListConfig<T>, state: ListState, now = Date.now()): T[] {
  const byKey = new Map(config.fields.map((f) => [f.key, f]));
  const q = state.q.trim().toLowerCase();
  const quick = Object.entries(state.quick).filter(([key, v]) => v !== '' && byKey.has(key));
  const conditions = state.conditions.filter((c) => !isIncomplete(c, byKey.get(c.field) as ListField<unknown> | undefined));

  const kept = rows.filter((row) => {
    if (q && !config.searchText(row).toLowerCase().includes(q)) return false;
    if (quick.some(([key, v]) => String(byKey.get(key)!.get(row) ?? '') !== v)) return false;
    if (!conditions.length) return true;
    const results = conditions.map((c) => {
      const field = byKey.get(c.field)!;
      return matches(c.op, field.get(row), c.value, field.kind, now);
    });
    return state.match === 'any' ? results.some(Boolean) : results.every(Boolean);
  });

  const field = state.sort && byKey.get(state.sort.key);
  if (!state.sort || !field) return kept;
  const sign = state.sort.dir === 'asc' ? 1 : -1;
  return kept
    .map((row, index) => ({ row, index, key: sortKey(field, row) }))
    .sort((a, b) => {
      const blankA = isBlank(a.key);
      const blankB = isBlank(b.key);
      if (blankA || blankB) return blankA === blankB ? a.index - b.index : blankA ? 1 : -1;
      return sign * compare(a.key, b.key) || a.index - b.index;
    })
    .map((x) => x.row);
}

/** The next order when a header is clicked: its first direction, then the other, then the default. */
export function nextSort<T>(config: ListConfig<T>, current: SortState | null, key: string): SortState | null {
  const field = config.fields.find((f) => f.key === key);
  if (!field) return current;
  const first = FIRST_DIR[field.kind];
  if (current?.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === 'asc' ? 'desc' : 'asc' };
  return null;
}

const sameSort = (a: SortState | null, b: SortState | null) => a?.key === b?.key && a?.dir === b?.dir;

/** Reads a list's state from the URL; anything unknown or malformed is ignored. */
export function readState<T>(params: URLSearchParams, config: ListConfig<T>): ListState {
  const p = config.paramPrefix ?? '';
  const keys = new Set(config.fields.map((f) => f.key));
  const rawSort = params.get(p + PARAM.sort);
  let sort = config.defaultSort;
  if (rawSort) {
    const key = rawSort.replace(/^-/, '');
    if (keys.has(key)) sort = { key, dir: rawSort.startsWith('-') ? 'desc' : 'asc' };
  }
  const quick: Record<string, string> = {};
  for (const f of config.fields) {
    const v = params.get(`${p}${PARAM.quick}${f.key}`);
    if (v) quick[f.key] = v;
  }
  let conditions: Condition[] = [];
  try {
    const parsed = JSON.parse(params.get(p + PARAM.conditions) ?? '[]') as unknown;
    if (Array.isArray(parsed)) {
      conditions = parsed
        .filter((c): c is [string, Operator, string] => Array.isArray(c) && keys.has(String(c[0])) && typeof c[1] === 'string')
        .map(([field, op, value]) => ({ field, op, value: String(value ?? '') }));
    }
  } catch {
    conditions = [];
  }
  const match: MatchMode = params.get(p + PARAM.match) === 'any' ? 'any' : 'all';
  return { q: params.get(p + PARAM.search) ?? '', sort, quick, conditions, match };
}

/** Writes one part of a list's state into URL params (a copy); defaults are left out of the URL. */
export function writeState<T>(params: URLSearchParams, config: ListConfig<T>, change: ListStateChange) {
  const p = config.paramPrefix ?? '';
  const next = new URLSearchParams(params);
  const put = (name: string, value: string | null) => (value ? next.set(p + name, value) : next.delete(p + name));
  if (change.q !== undefined) put(PARAM.search, change.q);
  if (change.sort !== undefined) {
    const sort = change.sort;
    // The default order (or "back to default") keeps nothing in the URL.
    put(PARAM.sort, !sort || sameSort(sort, config.defaultSort) ? null : `${sort.dir === 'desc' ? '-' : ''}${sort.key}`);
  }
  if (change.quick) for (const [key, value] of Object.entries(change.quick)) put(`${PARAM.quick}${key}`, value || null);
  if (change.conditions !== undefined) {
    put(PARAM.conditions, change.conditions.length ? JSON.stringify(change.conditions.map((c) => [c.field, c.op, c.value])) : null);
  }
  if (change.match !== undefined) put(PARAM.match, change.match === 'any' ? 'any' : null);
  return next;
}

/** A new condition on `field`, with its kind's first operator. */
export const newCondition = <T,>(field: ListField<T>): Condition => ({ field: field.key, op: OPERATORS[field.kind][0].op, value: '' });

/** Whether a search, a quick filter or a complete condition narrows the list (the order doesn't count). */
export const isFiltering = (state: ListState, config: ListConfig<unknown>) =>
  state.q.trim() !== '' ||
  Object.values(state.quick).some(Boolean) ||
  state.conditions.some((c) => !isIncomplete(c, config.fields.find((f) => f.key === c.field)));
