// Built-in document store: collections and records (docs/API_CONTRACT.md).
import type { FieldType } from './common.types';

export type DataFieldType = FieldType;

export interface DataField {
  key: string;
  type: DataFieldType;
  required: boolean;
  /** No two records may have the same value (the database refuses duplicates with 409). */
  unique?: boolean;
}

export interface DataCollection {
  id: string;
  /** /^[a-z][a-z0-9_]{1,47}$/; stored in MongoDB as `data.<name>`. Rename with POST …/rename. */
  name: string;
  label: string;
  description: string;
  /** optional schema: required + type checks on write (also enforced by MongoDB); other fields are allowed */
  fields: DataField[];
  /** custom indexes (unique fields and the built-in order index come on top) */
  indexes: IndexSpec[];
  recordCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 1 ascending, -1 descending, 'text' full-text. */
export type IndexOrder = 1 | -1 | 'text';

export interface IndexKey {
  /** a field, a nested path (customer.phone), or createdAt / updatedAt */
  field: string;
  order: IndexOrder;
}

export interface IndexSpec {
  name: string;
  keys: IndexKey[];
  unique?: boolean;
  sparse?: boolean;
  /** only records matching this filter are indexed ($eq $gt $gte $lt $lte $in $exists) */
  partialFilter?: Record<string, unknown>;
  /** TTL: records are deleted this many seconds after their createdAt / updatedAt */
  expireAfterSeconds?: number;
}

/** built-in: always there · unique-field: from a unique field · custom: yours · external: made outside ShipFlow */
export type IndexOrigin = 'built-in' | 'unique-field' | 'custom' | 'external';

export interface IndexInfo {
  name: string;
  origin: IndexOrigin;
  keys: IndexKey[];
  unique: boolean;
  sparse: boolean;
  partialFilter: Record<string, unknown> | null;
  expireAfterSeconds: number | null;
  /** missing: defined but not in the database yet */
  status: 'ready' | 'missing';
  sizeBytes: number | null;
  /** queries that used it since usedSince (the database server's last restart) */
  uses: number | null;
  usedSince: string | null;
}

export interface CollectionStats {
  /** the MongoDB collection, e.g. data.shipments */
  storedAs: string;
  records: number;
  dataSizeBytes: number;
  storageSizeBytes: number;
  avgRecordBytes: number;
  indexes: number;
  indexSizeBytes: number;
}

export interface CollectionInput {
  name: string;
  label?: string;
  description?: string;
  fields?: DataField[];
}

export type CollectionUpdate = Pick<DataCollection, 'label' | 'description' | 'fields'> & { indexes?: IndexSpec[] };

/** A record is flat: system fields + the stored fields. id / createdAt / updatedAt can't be written. */
export type DataRecord = { id: string; createdAt: string; updatedAt: string } & Record<string, unknown>;

export interface RecordsPage {
  total: number;
  records: DataRecord[];
}

export interface RecordsQuery {
  limit?: number;
  skip?: number;
  /** JSON filter, e.g. {"price":{"$gte":100}} */
  filter?: string;
  /** JSON sort, e.g. {"createdAt":-1} */
  sort?: string;
}

/** POST /data/samples — the sample collections that were missing and got created. */
export interface SampleDataResult {
  created: string[];
}

/** Where data steps read from: one of your collections, or built-in data (shipments, warehouses, couriers). */
export type DataSourceKind = 'collection' | 'system';

/** A field you can filter and sort on. `key` may be a dotted path (`customer.name`, `items.sku`). */
export interface DataSourceField {
  key: string;
  type: FieldType;
  description?: string;
  /** Collections only: no two records share a value, so a lookup by it finds at most one. */
  unique?: boolean;
}

/** GET /data/sources — collections first, then the built-in sources (`system.*`). */
export interface DataSourceInfo {
  /** A collection name, or `system.shipments` / `system.warehouses` / `system.couriers`. */
  name: string;
  label: string;
  kind: DataSourceKind;
  description: string;
  /** Collections can be written by Create / Update / Delete record; built-in data is read-only. */
  writable: boolean;
  fields: DataSourceField[];
}

/** A record of any source. Built-in records have their own shape (couriers have no createdAt). */
export type SourceRecord = { id: string } & Record<string, unknown>;

export interface SourceRecordsPage {
  total: number;
  records: SourceRecord[];
}
