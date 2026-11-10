import type { FilterCondition } from '../../../shared/query/record-query.types';

export interface RecordListInput {
  filter?: unknown;
  sort?: unknown;
  limit?: number;
  skip?: number;
  /** Added by the application, not by users (e.g. where a page cursor resumes); ANDed with `filter`. */
  conditions?: FilterCondition[];
  /** Only these fields (a list or "a,b"); id and the timestamps always come along. */
  fields?: unknown;
}

export interface ChangeOptions {
  /** A filter the record must also match, checked and written at once. */
  onlyIf?: unknown;
  /** Create the record when nothing matches (a field target only). */
  upsert?: boolean;
}

/** Changing or deleting many records needs a filter — or `all: true` to mean every record. */
export interface ManyInput {
  filter?: unknown;
  all?: boolean;
}
