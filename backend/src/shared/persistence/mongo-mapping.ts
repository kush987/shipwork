import { omit } from 'lodash';

/**
 * Mapping between MongoDB documents (`_id`, `Date` timestamps) and domain objects (`id`, ISO
 * strings). Every repository uses these instead of hand-writing the same conversions.
 */
export const toIso = (date: Date | string): string => new Date(date).toISOString();
export const toIsoOrNull = (date: Date | string | null | undefined): string | null => (date ? toIso(date) : null);
export const toDateOrNull = (iso: string | Date | null | undefined): Date | null => (iso ? new Date(iso) : null);

type Timestamps = { createdAt: Date | string; updatedAt?: Date | string };
type DocTimestamps<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { _id: string; createdAt: Date } & (T extends { updatedAt: string } ? { updatedAt: Date } : unknown);

/** `{ _id, createdAt: Date, updatedAt: Date, …rest }` → `{ id, createdAt: ISO, updatedAt: ISO, …rest }`. */
export function fromDocument<T extends { id: string } & Timestamps>(doc: { _id: string } & Timestamps & Record<string, unknown>): T {
  return {
    ...omit(doc, ['_id', 'createdAt', 'updatedAt']),
    id: doc._id,
    createdAt: toIso(doc.createdAt),
    ...(doc.updatedAt !== undefined ? { updatedAt: toIso(doc.updatedAt) } : {}),
  } as unknown as T;
}

/** The reverse of `fromDocument`: `{ id, createdAt: ISO, … }` → `{ _id, createdAt: Date, … }`. */
export function toDocument<T extends { id: string } & Timestamps>(entity: T): DocTimestamps<T> {
  return {
    ...omit(entity, ['id', 'createdAt', 'updatedAt']),
    _id: entity.id,
    createdAt: new Date(entity.createdAt),
    ...(entity.updatedAt !== undefined ? { updatedAt: new Date(entity.updatedAt) } : {}),
  } as unknown as DocTimestamps<T>;
}

/** Prefixes keys for a nested `$set` / `$unset`, e.g. `{ a: 1 }` → `{ 'data.a': 1 }`. */
export const nestedPaths = <T>(prefix: string, values: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [`${prefix}.${key}`, value]));
