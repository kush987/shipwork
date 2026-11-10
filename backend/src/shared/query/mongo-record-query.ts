import { escapeRegExp } from 'lodash';
import type { FilterCondition, SortKey } from './record-query.types';
import type { MongoFieldMapping } from './mongo-record-query.types';

const toDate = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v) : v);

/** A mapping for documents stored as-is: `id` is `_id`, the listed fields are Dates. */
export function directMapping(dateFields: string[]): MongoFieldMapping {
  return {
    path: (field) => (field === 'id' ? '_id' : field),
    value: (field, value) => (!dateFields.includes(field) ? value : Array.isArray(value) ? value.map(toDate) : toDate(value)),
  };
}

/**
 * Translates parsed (already whitelisted) conditions into a Mongo filter. Every module that stores
 * queryable documents shares this; only the field mapping differs.
 */
export function toMongoFilter(conditions: FilterCondition[], mapping: MongoFieldMapping): Record<string, unknown> {
  const filter: Record<string, Record<string, unknown>> = {};
  const alsoRequired: Record<string, unknown>[] = [];
  let search: Record<string, unknown> | undefined;
  for (const { field, op, value } of conditions) {
    if (op === '$search') {
      search = { $search: String(value) };
      continue;
    }
    const path = mapping.path(field);
    const ops = op === '$contains' ? { $regex: escapeRegExp(String(value)), $options: 'i' } : { [op]: mapping.value(field, value) };
    const clause = (filter[path] ??= {});
    // The same operator twice on one field (a filter's $lt and a page cursor's $lt) must both hold, not overwrite.
    if (Object.keys(ops).some((key) => key in clause)) alsoRequired.push({ [path]: ops });
    else Object.assign(clause, ops);
  }
  return { ...filter, ...(search ? { $text: search } : {}), ...(alsoRequired.length ? { $and: alsoRequired } : {}) };
}

export function toMongoSort(sort: SortKey[], mapping: MongoFieldMapping): Record<string, 1 | -1> {
  const out: Record<string, 1 | -1> = {};
  for (const { field, direction } of sort) out[mapping.path(field)] = direction;
  if (!('_id' in out)) out._id = sort[0]?.direction ?? -1; // stable order for pagination
  return out;
}
