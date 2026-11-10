import type { DataRecord } from './data-collection.types';

/** One change to a record of a data collection, as a record-changed trigger sees it. */
export interface RecordChangeEvent {
  /** Unique per change (the same change delivered twice has the same id). */
  id: string;
  collection: string;
  operation: 'created' | 'updated' | 'deleted';
  recordId: string;
  /** After the change (null for a delete). */
  record: DataRecord | null;
  /** Before an update or delete, when the database kept it. */
  previous: DataRecord | null;
  /** Updates: the fields that changed (set or removed). */
  changedFields: string[] | null;
  at: string;
  /** Where to resume after this change (opaque). */
  resumeToken: unknown;
}

export interface RecordChangeSubscription {
  close(): Promise<void>;
}

/**
 * Every change to a workspace's data collections, in order, from a point it can resume from. The
 * Mongo adapter uses change streams (the database must be a replica set).
 */
export abstract class RecordChangeFeed {
  /**
   * Calls `onChange` for each change, one at a time (the next waits for the previous). `onError` is
   * told when the feed stops (e.g. the resume point is too old); the caller decides whether to reopen.
   */
  abstract open(
    tenantId: string,
    resumeAfter: unknown,
    onChange: (event: RecordChangeEvent) => Promise<void>,
    onError: (error: Error, resumeLost: boolean) => void,
  ): Promise<RecordChangeSubscription>;
}
