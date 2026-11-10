/** One write in a transaction; `as` names its result for later operations and the caller. */
export type TransactionOperation =
  | { op: 'insert'; collection: string; as: string; record: Record<string, unknown> }
  | {
      op: 'update';
      collection: string;
      as: string;
      update: Record<string, unknown>;
      /** The record: by id, or the newest whose `findBy` field equals `value`. */
      id?: string;
      findBy?: string;
      value?: unknown;
      onlyIf?: Record<string, unknown>;
      upsert?: boolean;
    }
  | { op: 'delete'; collection: string; as: string; id: string };

/** Why a transaction was rolled back (a problem in its own data, not an outage). */
export type TransactionAbortReason = 'not_found' | 'unmet' | 'duplicate' | 'invalid';

export interface TransactionResult {
  committed: boolean;
  /** Each operation's result by its `as` (records; `{ deleted: id }` for deletes). Empty when rolled back. */
  results: Record<string, unknown>;
  abortedAt?: { index: number; as: string; op: string; collection: string };
  reason?: TransactionAbortReason;
  message?: string;
}
