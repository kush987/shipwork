import { ValidationFailedError } from '../domain/errors';
import { FIELD_PATH } from './record-query.constants';
import type { FilterCondition, Primitive, SortKey } from './record-query.types';

/**
 * Where a page ended in a list ordered by one field, ties broken by id (keyset pagination). Unlike an
 * offset, it stays right while records are added or removed: the next page starts after this record,
 * not after "the first N", so nothing repeats or goes missing as a feed grows.
 */
export interface CursorPosition {
  field: string;
  direction: 1 | -1;
  /** The last record's value of `field` (null when it has none). */
  value: Primitive;
  /** The last record's id. */
  id: string;
}

const invalid = (message: string): never => {
  throw new ValidationFailedError([{ message }]);
};

const isPrimitive = (v: unknown): v is Primitive => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Opaque to callers: base64url JSON. Not secret — it only says where to continue, which a filter could say too. */
export function encodeCursor({ field, direction, value, id }: CursorPosition): string {
  return Buffer.from(JSON.stringify({ f: field, d: direction, v: value, id })).toString('base64url');
}

/** The position a cursor stands for, if it was made for this order. */
export function decodeCursor(text: string, order: SortKey): CursorPosition {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
  } catch {
    return invalid('The cursor is not valid — use the nextCursor of the previous page, or none for the first page');
  }
  const { f, d, v, id } = (raw ?? {}) as Record<string, unknown>;
  if (typeof f !== 'string' || !FIELD_PATH.test(f) || (d !== 1 && d !== -1) || !isPrimitive(v) || typeof id !== 'string' || !id) {
    return invalid('The cursor is not valid — use the nextCursor of the previous page, or none for the first page');
  }
  if (f !== order.field || d !== order.direction) {
    return invalid('The cursor was made for a different order of the list — start again without a cursor');
  }
  return { field: f, direction: d, value: v, id };
}

/** The cursor of a page's last record. */
export function cursorAfter(record: Record<string, unknown>, order: SortKey, valueOf: (record: Record<string, unknown>, field: string) => unknown): string {
  const value = valueOf(record, order.field) ?? null;
  if (!isPrimitive(value)) invalid(`Infinite scroll can't order by “${order.field}”: it holds a list or an object`);
  return encodeCursor({ field: order.field, direction: order.direction, value: value as Primitive, id: String(record.id) });
}

/**
 * The records after a position, as a few ANDed condition sets to read one after another (the query
 * language has no OR). Missing and null values order first, as in Mongo:
 *   ascending:  same value with a later id → (non-null:) greater values | (null:) every non-null value
 *   descending: same value with an earlier id → smaller values → the records without a value
 */
export function conditionsAfter({ field, direction, value, id }: CursorPosition): FilterCondition[][] {
  const idStep: FilterCondition = { field: 'id', op: direction === 1 ? '$gt' : '$lt', value: id };
  if (field === 'id') return [[idStep]];
  const sameValue: FilterCondition[] = [{ field, op: '$eq', value }, idStep];
  if (direction === 1) return [sameValue, [value === null ? { field, op: '$ne', value: null } : { field, op: '$gt', value }]];
  if (value === null) return [sameValue];
  return [sameValue, [{ field, op: '$lt', value }], [{ field, op: '$eq', value: null }]];
}
