import { MAX_LIMIT, MAX_LIST } from '../../../shared/query/record-query.constants';

/** Joins one step may run. */
export const MAX_JOINS = 5;

/** The settings a join takes; anything else is a typo worth reporting. */
export const JOIN_KEYS = ['from', 'localField', 'foreignField', 'as', 'many'] as const;

/** Keys per lookup query (the `$in` limit of the query language). */
export const JOIN_KEYS_PER_QUERY = MAX_LIST;

/** Related records one lookup query reads. A query that fills it is split, so no key loses its matches. */
export const JOIN_ROWS_PER_QUERY = MAX_LIMIT;

/** Lookup queries one join may run before it stops splitting and reports `truncated`. */
export const JOIN_QUERY_BUDGET = 20;
