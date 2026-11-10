import type { FilterCondition } from '../../../shared/query/record-query.types';
import type { DataRecord } from './data-collection.types';

/** Items to add to a list field, with MongoDB's $push modifiers. */
export interface PushItems {
  each: unknown[];
  /** Keep only this many items afterwards (negative: the last ones). */
  slice?: number;
  /** Insert at this position instead of the end. */
  position?: number;
}

/**
 * A checked change to records, in MongoDB's terms. Every field appears in one operator only; a
 * field set to null is in `unset`. Date fields hold ISO text here (the adapter stores real dates).
 */
export interface RecordChange {
  set: Record<string, unknown>;
  unset: string[];
  inc: Record<string, number>;
  mul: Record<string, number>;
  min: Record<string, unknown>;
  max: Record<string, unknown>;
  push: Record<string, PushItems>;
  addToSet: Record<string, unknown[]>;
  /** A value, or a condition object ({"$gte": 6}) the removed items match. */
  pull: Record<string, unknown>;
  /** Fields set to the time of the write. */
  currentDate: string[];
  /** Only used when an upsert creates the record. */
  setOnInsert: Record<string, unknown>;
}

/** Which record an update is about: by id, or the newest whose field equals a value. */
export type RecordTarget = { id: string } | { field: string; value: unknown };

export interface UpdateOptions {
  /** Only change it when it also matches these conditions (atomic: checked and written at once). */
  onlyIf?: FilterCondition[];
  /** Create it when nothing matches the target (needs a field target). */
  upsert?: boolean;
}

/** updated / created (an upsert) / not_found / unmet (exists, but onlyIf didn't hold). */
export type UpdateOutcome = 'updated' | 'created' | 'not_found' | 'unmet';

export interface UpdateResult {
  outcome: UpdateOutcome;
  record: DataRecord | null;
}

export interface ManyResult {
  matched: number;
  modified: number;
}
