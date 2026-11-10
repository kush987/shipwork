import { getPath } from '../util/path';
import type { FilterCondition, RecordQuery, SortKey } from './record-query.types';

const isNullish = (v: unknown) => v === null || v === undefined;

/**
 * Orders values as Mongo does: missing and null first, numbers numerically, text by code unit (not by
 * locale). Sorting and the range operators share it, so a page cursor's `$lt`/`$gt` agrees with the order.
 */
const compare = (a: unknown, b: unknown): number => {
  if (isNullish(a) || isNullish(b)) return isNullish(a) === isNullish(b) ? 0 : isNullish(a) ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const [x, y] = [String(a), String(b)];
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Evaluates the query language in memory with the same semantics the Mongo translation has.
 * Used for small read models (warehouses, couriers) and by the in-memory test fakes. A field
 * that holds a list matches when any element does (as in Mongo: `items.sku`, `tags`).
 */
/** Every value at `path`, stepping into lists on the way (`items.sku` → each item's sku), as Mongo does. */
function valuesAt(record: unknown, path: string): unknown[] {
  let current: unknown[] = [record];
  for (const key of path.split('.')) {
    current = current.flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined));
  }
  return current.flatMap((v) => (Array.isArray(v) ? v : [v]));
}

export function matchesCondition(record: object, { field, op, value }: FilterCondition): boolean {
  const values = valuesAt(record, field);
  const present = values.filter((v) => v !== undefined);
  const any = (test: (v: unknown) => boolean) => values.some(test);
  const anyPresent = (test: (v: unknown) => boolean) => present.some(test);
  // As in Mongo, null matches a missing field too; ranges compare present, non-null values only.
  const same = (v: unknown) => (value === null ? isNullish(v) : v === value);
  const inRange = (test: (order: number) => boolean) => value !== null && anyPresent((v) => v !== null && test(compare(v, value)));
  switch (op) {
    case '$eq':
      return any(same);
    case '$ne':
      return !any(same);
    case '$gt':
      return inRange((o) => o > 0);
    case '$gte':
      return value === null ? any(isNullish) : inRange((o) => o >= 0);
    case '$lt':
      return inRange((o) => o < 0);
    case '$lte':
      return value === null ? any(isNullish) : inRange((o) => o <= 0);
    case '$in':
      return any((v) => (value as unknown[]).includes(v));
    case '$nin':
      return !any((v) => (value as unknown[]).includes(v));
    case '$exists':
      return present.length > 0 === value;
    case '$contains':
      return any((v) => String(v ?? '').toLowerCase().includes(String(value).toLowerCase()));
    case '$search':
      return matchesSearch(record, String(value));
  }
}

/** Text of every string in a record, nested ones included. */
const allText = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(allText) : [];

/**
 * In memory, text search is approximated: a record matches when it contains any of the words, every
 * "quoted phrase", and none of the -excluded words (the database does it with its text index).
 */
function matchesSearch(record: object, search: string): boolean {
  const text = allText(record).join(' ').toLowerCase();
  const phrases = [...search.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
  const words = search.replace(/"[^"]*"/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
  const excluded = words.filter((w) => w.startsWith('-')).map((w) => w.slice(1));
  const wanted = words.filter((w) => !w.startsWith('-'));
  if (excluded.some((w) => w && text.includes(w))) return false;
  if (!phrases.every((p) => text.includes(p))) return false;
  return !wanted.length || wanted.some((w) => text.includes(w));
}

export const matchesAll = (record: object, conditions: FilterCondition[]) => conditions.every((c) => matchesCondition(record, c));

export function sortRecords<T extends object>(records: T[], sort: SortKey[]): T[] {
  return [...records].sort((a, b) => {
    for (const { field, direction } of sort) {
      const order = compare(getPath(a, field), getPath(b, field));
      if (order !== 0) return order * direction;
    }
    return 0;
  });
}

/** Filter, sort and page a list that is already in memory. */
export function runInMemory<T extends object>(records: T[], query: RecordQuery): { records: T[]; total: number } {
  const matched = records.filter((r) => matchesAll(r, query.conditions));
  return { total: matched.length, records: sortRecords(matched, query.sort).slice(query.skip, query.skip + query.limit) };
}
