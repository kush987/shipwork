import type { ReactNode } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string;
  dir: SortDir;
}

/** How a column is compared, filtered and offered in the condition builder. */
export type FieldKind = 'text' | 'enum' | 'number' | 'date';

export type FieldValue = string | number | boolean | null | undefined;

export interface ListOption {
  value: string;
  label: string;
}

/** One column (or property) of a list that can be sorted and filtered. */
export interface ListField<T> {
  /** Short id, used in the URL (`sort=updated`, `f.status=paused`). */
  key: string;
  label: string;
  kind: FieldKind;
  /** The row's value: an option value for enums, an ISO string for dates. */
  get: (row: T) => FieldValue;
  /** The choices of an enum (also how its values are labelled and sorted). */
  options?: ListOption[];
  /** Offered as a select next to the search box. */
  quick?: boolean;
  /** Default true. */
  sortable?: boolean;
  /** Offered in the condition builder. Default true. */
  filterable?: boolean;
}

export interface ListConfig<T> {
  fields: ListField<T>[];
  /** The text the search box looks in. */
  searchText: (row: T) => string;
  searchPlaceholder: string;
  /** Order before anyone sorts; null keeps the order the rows came in. */
  defaultSort: SortState | null;
  /** Singular and plural, for "3 of 12 workflows". */
  noun: [string, string];
  /** Prefix of the URL parameters, when a page shows two lists at once. */
  paramPrefix?: string;
}

export type Operator =
  | 'contains'
  | 'not_contains'
  | 'is'
  | 'is_not'
  | 'starts_with'
  | 'empty'
  | 'not_empty'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'after'
  | 'before'
  | 'within_days';

export interface OperatorSpec {
  op: Operator;
  label: string;
  /** Whether the operator compares with a value (false for "is empty"). */
  needsValue: boolean;
}

/** One row of the condition builder: `<field> <operator> <value>`. */
export interface Condition {
  field: string;
  op: Operator;
  value: string;
}

export type MatchMode = 'all' | 'any';

/** Everything that decides which rows show, in which order (kept in the URL). */
export interface ListState {
  q: string;
  /** The order in effect: the chosen one, else the default. */
  sort: SortState | null;
  quick: Record<string, string>;
  conditions: Condition[];
  match: MatchMode;
}

/** Part of a list's state to change (quick filters are merged key by key). */
export type ListStateChange = Partial<Omit<ListState, 'quick'>> & { quick?: Record<string, string> };

export interface ListControls<T> {
  config: ListConfig<T>;
  state: ListState;
  /** The rows to show: searched, filtered and sorted. */
  rows: T[];
  total: number;
  /** Whether a search, quick filter or condition narrows the list. */
  filtering: boolean;
  setSearch: (q: string) => void;
  /** Header click: first direction, then the other, then back to the default order. */
  toggleSort: (key: string) => void;
  setSort: (sort: SortState | null) => void;
  setQuick: (key: string, value: string) => void;
  setConditions: (conditions: Condition[]) => void;
  setMatch: (match: MatchMode) => void;
  /** Clears the search, quick filters and conditions (keeps the order). */
  clear: () => void;
}

export interface ListToolbarProps<T> {
  list: ListControls<T>;
  /** Page-specific controls, after the filters (e.g. a status switch that asks the server). */
  children?: ReactNode;
  /** Show the sort menu on every screen (cards have no headers to click); otherwise phones only. */
  sortMenu?: boolean;
}

export interface SortHeaderProps<T> {
  list: ListControls<T>;
  field: string;
  /** Defaults to the field's label. */
  label?: ReactNode;
  className?: string;
}

export interface ConditionsPanelProps<T> {
  list: ListControls<T>;
}

export interface ListEmptyProps<T> {
  list: ListControls<T>;
}
