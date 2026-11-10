import { ValidationFailedError } from '../domain/errors';
import { isPlainObject } from '../util/json-setting';
import { FilterCondition, RecordQuery, FilterOperator, SortKey, Primitive } from './record-query.types';
import { FILTER_OPERATORS, MAX_LIST, FIELD_PATH, MAX_CONDITIONS, DEFAULT_SORT, MAX_LIMIT, TEXT_SEARCH, MAX_SEARCH_LENGTH, MAX_FIELDS } from './record-query.constants';
import { clamp } from 'lodash';

const isPrimitive = (v: unknown): v is Primitive => v === null || ['string', 'number', 'boolean'].includes(typeof v);

const fail = (message: string): never => {
  throw new ValidationFailedError([{ message }]);
};

export function parseFilter(raw: unknown): FilterCondition[] {
  if (raw === undefined || raw === null || raw === '') return [];
  if (!isPlainObject(raw)) return fail('Filter must be a JSON object, e.g. {"status": "active"}');
  const conditions: FilterCondition[] = [];
  for (const [field, condition] of Object.entries(raw)) {
    if (field === TEXT_SEARCH) {
      conditions.push(parseSearch(condition));
      continue;
    }
    if (!FIELD_PATH.test(field)) fail(`Filter field “${field}” is not valid (letters, digits, _ and dots)`);
    if (isPlainObject(condition)) {
      const entries = Object.entries(condition);
      if (!entries.length) fail(`Filter for “${field}” is empty`);
      for (const [op, value] of entries) conditions.push(parseCondition(field, op, value));
    } else if (isPrimitive(condition)) {
      conditions.push({ field, op: '$eq', value: condition });
    } else {
      fail(`Filter for “${field}” must be a value or an operator object like {"$in": […]}`);
    }
  }
  if (conditions.length > MAX_CONDITIONS) fail(`Filters can have at most ${MAX_CONDITIONS} conditions`);
  return conditions;
}

/** `{"$text": "red shirt"}`: words to look for with the collection's text index. */
function parseSearch(value: unknown): FilterCondition {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > MAX_SEARCH_LENGTH) fail(`$text needs the words to search for (up to ${MAX_SEARCH_LENGTH} characters)`);
  return { field: TEXT_SEARCH, op: '$search', value: text };
}

function parseCondition(field: string, op: string, value: unknown): FilterCondition {
  if (op === '$search') fail(`$search only works as {"${TEXT_SEARCH}": "words"}`);
  if (!(FILTER_OPERATORS as readonly string[]).includes(op)) fail(`Unknown filter operator “${op}” — use ${FILTER_OPERATORS.filter((o) => o !== '$search').join(' ')}`);
  const operator = op as FilterOperator;
  switch (operator) {
    case '$in':
    case '$nin':
      if (!Array.isArray(value) || value.length > MAX_LIST || !value.every(isPrimitive)) fail(`${op} on “${field}” needs a list of up to ${MAX_LIST} plain values`);
      break;
    case '$exists':
      if (typeof value !== 'boolean') fail(`$exists on “${field}” needs true or false`);
      break;
    case '$contains':
      if (typeof value !== 'string' && typeof value !== 'number') fail(`$contains on “${field}” needs text`);
      break;
    default:
      if (!isPrimitive(value)) fail(`${op} on “${field}” needs a plain value`);
  }
  return { field, op: operator, value };
}

export function parseSort(raw: unknown): SortKey[] {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_SORT;
  if (!isPlainObject(raw)) return fail('Sort must be a JSON object, e.g. {"createdAt": -1}');
  const keys = Object.entries(raw).map(([field, direction]) => {
    if (!FIELD_PATH.test(field)) fail(`Sort field “${field}” is not valid`);
    if (direction !== 1 && direction !== -1 && direction !== 'asc' && direction !== 'desc') fail(`Sort direction for “${field}” must be 1 or -1`);
    return { field, direction: direction === 1 || direction === 'asc' ? 1 : -1 } as SortKey;
  });
  return keys.length ? keys.slice(0, 3) : DEFAULT_SORT;
}

/**
 * `conditions` are added by the application itself (e.g. where a page cursor resumes), already in
 * parsed form, so they can repeat a field and operator the user's filter uses.
 */
/** "name, price" or ["name", "price"] → the fields to return; empty → every field. */
export function parseFields(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  const fields = [...new Set(list.map((f) => String(f).trim()).filter(Boolean))];
  if (!fields.length) return undefined;
  if (fields.length > MAX_FIELDS) fail(`Ask for at most ${MAX_FIELDS} fields`);
  for (const field of fields) if (!FIELD_PATH.test(field)) fail(`“${field}” is not a field name`);
  return fields;
}

export const isTextSearch = (conditions: FilterCondition[]) => conditions.some((c) => c.field === TEXT_SEARCH);

export function buildQuery(input: {
  filter?: unknown;
  sort?: unknown;
  limit?: number;
  skip?: number;
  conditions?: FilterCondition[];
  fields?: unknown;
}): RecordQuery {
  const limit = Math.trunc(Number(input.limit ?? 50));
  const skip = Math.trunc(Number(input.skip ?? 0));
  const conditions = [...parseFilter(input.filter), ...(input.conditions ?? [])];
  const sortGiven = !(input.sort === undefined || input.sort === null || input.sort === '' || (isPlainObject(input.sort) && !Object.keys(input.sort).length));
  return {
    conditions,
    fields: parseFields(input.fields),
    // A search without a sort lists the best matches first.
    ...(isTextSearch(conditions) && !sortGiven ? { relevance: true } : {}),
    sort: parseSort(input.sort),
    limit: Number.isFinite(limit) ? clamp(limit, 1, MAX_LIMIT) : 50,
    skip: Number.isFinite(skip) ? clamp(skip, 0, Number.MAX_SAFE_INTEGER) : 0,
  };
}
