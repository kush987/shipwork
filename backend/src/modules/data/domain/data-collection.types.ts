import { FieldSpec } from '../../../shared/schema/field-schema.types';
import type { INDEX_ORDERS } from './data-collection.constants';

/** 1 ascending, -1 descending, 'text' full-text. */
export type IndexOrder = (typeof INDEX_ORDERS)[number];

export interface IndexKey {
  /** A field, a nested path (`customer.phone`) or `createdAt` / `updatedAt`. */
  field: string;
  order: IndexOrder;
}

/** An index users define on a collection; the platform keeps the database's index in step with it. */
export interface IndexSpec {
  name: string;
  keys: IndexKey[];
  /** No two records may have the same values for these keys. */
  unique?: boolean;
  /** Records without the indexed field are left out of the index. */
  sparse?: boolean;
  /** Only records matching this filter (the query filter language) are indexed. */
  partialFilter?: Record<string, unknown>;
  /** TTL: a record is deleted this many seconds after the date in its (single, date) key. */
  expireAfterSeconds?: number;
}

export interface DataCollection {
  id: string;
  tenantId: string;
  name: string;
  label: string;
  description: string;
  /** Optional schema: required + type checks on write. Fields not listed are still allowed. */
  fields: FieldSpec[];
  /** Custom indexes (unique fields and the built-in order index come on top). */
  indexes: IndexSpec[];
  createdAt: string;
  updatedAt: string;
}

/** Records are flat: the stored fields plus the system fields. */
export type DataRecord = { id: string; createdAt: string; updatedAt: string } & Record<string, unknown>;

export interface CollectionInput {
  name?: string;
  label?: string;
  description?: string;
  fields?: FieldSpec[];
  /** Replaces the custom indexes when given. */
  indexes?: IndexSpec[];
}

/** Where an index comes from: always there, a unique field, defined by users, or made outside ShipFlow. */
export type IndexOrigin = 'built-in' | 'unique-field' | 'custom' | 'external';

/** An index as the database has it, with its size and how often queries used it. */
export interface IndexInfo {
  name: string;
  origin: IndexOrigin;
  keys: IndexKey[];
  unique: boolean;
  sparse: boolean;
  partialFilter: Record<string, unknown> | null;
  expireAfterSeconds: number | null;
  /** `missing`: defined but not (yet) in the database, e.g. a collection without records. */
  status: 'ready' | 'missing';
  sizeBytes: number | null;
  /** Queries that used it since `usedSince` (the server's last restart). */
  uses: number | null;
  usedSince: string | null;
}

export interface CollectionStats {
  /** The MongoDB collection that holds it, e.g. `data.shipments`. */
  storedAs: string;
  records: number;
  dataSizeBytes: number;
  storageSizeBytes: number;
  avgRecordBytes: number;
  indexes: number;
  indexSizeBytes: number;
}
