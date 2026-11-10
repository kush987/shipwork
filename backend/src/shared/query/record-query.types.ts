import { FILTER_OPERATORS } from './record-query.constants';

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export type Primitive = string | number | boolean | null;

export interface FilterCondition {
  field: string;
  op: FilterOperator;
  value: unknown;
}

export interface SortKey {
  field: string;
  direction: 1 | -1;
}

export interface RecordQuery {
  conditions: FilterCondition[];
  sort: SortKey[];
  limit: number;
  skip: number;
  /** Only these fields (plus id and the timestamps); undefined: every field. */
  fields?: string[];
  /** A text search without an explicit sort: best matches first. */
  relevance?: boolean;
}
