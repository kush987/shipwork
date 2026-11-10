import { SortKey } from './record-query.types';

/**
 * A small, safe query language for records, parsed into a storage-neutral form. Only whitelisted
 * operators and plain values get through, so user input can never smuggle storage-specific
 * operators (e.g. `$where`) into the database — adapters translate this form, not raw input.
 */
export const FILTER_OPERATORS = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists', '$contains', '$search'] as const;

/**
 * Full-text search over the collection's text index: `{"$text": "red cotton shirt"}` matches records
 * with any of the words (a quoted "phrase" must appear as is, -word excludes). It is the one filter
 * key that isn't a field; its condition is stored as `{ field: '$text', op: '$search' }`.
 */
export const TEXT_SEARCH = '$text';
export const MAX_SEARCH_LENGTH = 200;

/** Fields a read may ask for (`fields`), e.g. "name,price,customer.phone". */
export const MAX_FIELDS = 50;

export const MAX_LIMIT = 500;

export const MAX_CONDITIONS = 20;

export const MAX_LIST = 100;

export const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,4}$/;

export const DEFAULT_SORT: SortKey[] = [{ field: 'createdAt', direction: -1 }];
