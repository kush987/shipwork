import type { FieldType } from '../../../shared/schema/field-schema.types';
import type { SortKey } from '../../../shared/query/record-query.types';

export type DataSourceKind = 'collection' | 'system';

/** A field that can be filtered and sorted on. Dotted paths reach into nested objects and lists. */
export interface DataSourceField {
  key: string;
  type: FieldType;
  description?: string;
  /** Collections only: no two records share a value, so a lookup by this field finds at most one. */
  unique?: boolean;
}

/**
 * Something workflows can read records from: one of the tenant's collections, or built-in data
 * the application already keeps (shipments, warehouses, couriers).
 */
export interface DataSourceInfo {
  name: string;
  label: string;
  kind: DataSourceKind;
  description: string;
  /** Collections can be written by the data steps; built-in data changes only through its own steps. */
  writable: boolean;
  fields: DataSourceField[];
}

/** What a built-in source declares about itself. */
export interface SystemSourceInfo extends Pick<DataSourceInfo, 'name' | 'label' | 'description' | 'fields'> {
  /** Order used when a query names none. */
  defaultSort: SortKey[];
}

export type SourceRecord = Record<string, unknown>;
