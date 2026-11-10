import { CollectionStats, DataCollection, DataRecord, IndexInfo } from './data-collection.types';
import type { FilterCondition, RecordQuery } from '../../../shared/query/record-query.types';
import type { ManyResult, RecordChange, RecordTarget, UpdateOptions, UpdateResult } from './record-update.types';

export abstract class DataCollectionRepository {
  abstract create(collection: DataCollection): Promise<void>;
  abstract save(collection: DataCollection): Promise<void>;
  abstract findByName(tenantId: string, name: string): Promise<DataCollection | null>;
  abstract list(tenantId: string): Promise<DataCollection[]>;
  abstract delete(tenantId: string, name: string): Promise<void>;
  abstract count(tenantId: string): Promise<number>;
}

/** The parts of a definition record storage needs (its name, and which fields hold dates). */
export type StoredCollection = Pick<DataCollection, 'name' | 'fields'>;

/** Record writes that can run inside a transaction (all of them commit, or none). */
export interface RecordWrites {
  insert(tenantId: string, collection: StoredCollection, data: Record<string, unknown>): Promise<DataRecord>;
  update(tenantId: string, collection: StoredCollection, target: RecordTarget, change: RecordChange, options?: UpdateOptions): Promise<UpdateResult>;
  delete(tenantId: string, collection: StoredCollection, id: string): Promise<boolean>;
}

/**
 * Port for record storage: each data collection is a collection of its own in the workspace's
 * database. The Mongo adapter implements it today; another database would implement the same
 * contract without touching services or workflow nodes.
 */
export abstract class DataRecordRepository implements RecordWrites {
  abstract insert(tenantId: string, collection: StoredCollection, data: Record<string, unknown>): Promise<DataRecord>;
  abstract find(tenantId: string, collection: StoredCollection, query: RecordQuery): Promise<DataRecord[]>;
  abstract count(tenantId: string, collection: StoredCollection, query: Pick<RecordQuery, 'conditions'>): Promise<number>;
  abstract get(tenantId: string, collection: StoredCollection, id: string, fields?: string[]): Promise<DataRecord | null>;
  /**
   * Applies `change` to the record `target` names (the newest match for a field target), atomically
   * with `onlyIf`; with `upsert`, creates it when nothing matches.
   */
  abstract update(tenantId: string, collection: StoredCollection, target: RecordTarget, change: RecordChange, options?: UpdateOptions): Promise<UpdateResult>;
  abstract updateMany(tenantId: string, collection: StoredCollection, conditions: FilterCondition[], change: RecordChange): Promise<ManyResult>;
  abstract delete(tenantId: string, collection: StoredCollection, id: string): Promise<boolean>;
  abstract deleteMany(tenantId: string, collection: StoredCollection, conditions: FilterCondition[]): Promise<number>;
  abstract distinct(tenantId: string, collection: StoredCollection, field: string, conditions: FilterCondition[], limit: number): Promise<unknown[]>;
  /** Runs a pipeline that checkPipeline() approved; returns up to `limit` results. */
  abstract aggregate(
    tenantId: string,
    collection: StoredCollection,
    pipeline: Record<string, unknown>[],
    limit: number,
  ): Promise<{ results: Record<string, unknown>[]; truncated: boolean }>;
  /**
   * Runs `work` in a transaction: every write it makes through `writes` commits together, or — if
   * it throws — none does. Writes that conflict with others are retried by running `work` again.
   */
  abstract transaction<T>(tenantId: string, work: (writes: RecordWrites) => Promise<T>): Promise<T>;
  /** Records per collection, for the named collections. */
  abstract counts(tenantId: string, collections: string[]): Promise<Record<string, number>>;

  /**
   * Makes the stored collection match its definition: it exists, the database checks its field
   * types and required fields, and its indexes (built-in, unique fields, custom) are in place.
   * Cheap when nothing changed, so writes call it too. Throws UniqueConflictError when existing
   * records already share a value a new unique index needs to keep apart; nothing changes then.
   */
  abstract prepare(tenantId: string, collection: DataCollection): Promise<void>;
  /** Removes one custom index from the database. */
  abstract dropIndex(tenantId: string, collection: string, index: string): Promise<void>;
  /** Deletes the stored collection with its records and indexes. */
  abstract drop(tenantId: string, collection: string): Promise<void>;
  /** Renames the stored collection; its records and indexes move with it. */
  abstract rename(tenantId: string, from: string, to: string): Promise<void>;
  /** The indexes the database has for the collection, with sizes and use counts. */
  abstract indexes(tenantId: string, collection: DataCollection): Promise<IndexInfo[]>;
  abstract stats(tenantId: string, collection: string): Promise<CollectionStats>;
}
