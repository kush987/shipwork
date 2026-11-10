import { fieldSpecIssues } from '../../../shared/schema/field-schema';
import { parseFilter } from '../../../shared/query/record-query';
import { FIELD_PATH } from '../../../shared/query/record-query.constants';
import {
  BUILT_IN_INDEX,
  COLLECTION_NAME,
  DATE_FIELDS,
  INDEX_NAME,
  INDEX_ORDERS,
  MAX_INDEX_KEYS,
  MAX_INDEXES_PER_COLLECTION,
  MAX_TTL_SECONDS,
  PARTIAL_FILTER_OPERATORS,
  PHYSICAL_PREFIX,
  SYSTEM_FIELDS,
  UNIQUE_FIELD_INDEX_PREFIX,
} from './data-collection.constants';
import { CollectionInput, IndexSpec } from './data-collection.types';
import type { ValidationIssue } from '../../../shared/domain/errors.types';
import { FieldIssue, FieldSpec } from '../../../shared/schema/field-schema.types';

export function collectionIssues(input: CollectionInput, creating: boolean): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (creating && !COLLECTION_NAME.test(input.name ?? '')) issues.push({ message: collectionNameRule });
  if ((input.label ?? '').length > 80) issues.push({ message: 'Label is longer than 80 characters' });
  for (const message of fieldSpecIssues(input.fields ?? [])) issues.push({ message });
  for (const field of input.fields ?? []) {
    if (SYSTEM_FIELDS.includes(field.key)) issues.push({ message: `“${field.key}” is a system field and can't be declared` });
  }
  return issues;
}

export const collectionNameRule = 'Name must be 2–48 characters: a lowercase letter, then lowercase letters, digits or _';

/** The MongoDB collection a data collection is stored in, e.g. `data.shipments`. */
export const physicalName = (name: string) => PHYSICAL_PREFIX + name;

/** Fields whose values must differ between records. */
export const uniqueKeys = (collection: { fields?: FieldSpec[] }) => (collection.fields ?? []).filter((f) => f.unique).map((f) => f.key);

/** The index a unique field gets. */
export const uniqueFieldIndexName = (field: string) => UNIQUE_FIELD_INDEX_PREFIX + field;

/** Problems with a collection's custom indexes, given its fields (unique fields already have one). */
export function indexIssues(indexes: IndexSpec[], fields: FieldSpec[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const names = new Set<string>();
  const patterns = new Map<string, string>();
  for (const key of uniqueKeys({ fields })) patterns.set(JSON.stringify([[key, 1]]), `the unique field ${key}`);
  let textIndexes = 0;

  for (const index of indexes) {
    const problem = (message: string) => issues.push({ message: `Index “${index.name}”: ${message}` });
    if (!INDEX_NAME.test(index.name ?? '')) {
      issues.push({ message: `Index name “${index.name ?? ''}” must be 1–48 characters: a lowercase letter, then lowercase letters, digits or _` });
      continue;
    }
    if (index.name === BUILT_IN_INDEX || index.name.startsWith(UNIQUE_FIELD_INDEX_PREFIX)) problem('this name is reserved');
    if (names.has(index.name)) problem('two indexes have this name');
    names.add(index.name);

    const keys = index.keys ?? [];
    if (!keys.length || keys.length > MAX_INDEX_KEYS) problem(`give 1–${MAX_INDEX_KEYS} fields`);
    const seen = new Set<string>();
    for (const { field, order } of keys) {
      if (!FIELD_PATH.test(field ?? '') || field === 'id' || field === '_id') problem(`“${field}” is not a field it can index`);
      if (!(INDEX_ORDERS as readonly unknown[]).includes(order)) problem(`the order of ${field} must be 1, -1 or "text"`);
      if (seen.has(field)) problem(`${field} is listed twice`);
      seen.add(field);
    }

    const text = keys.some((k) => k.order === 'text');
    if (text) textIndexes++;
    if (text && index.unique) problem('a text index can’t be unique');
    if (index.sparse && index.partialFilter) problem('use sparse or a partial filter, not both');

    const ttl = index.expireAfterSeconds;
    if (ttl !== undefined && ttl !== null) {
      if (!Number.isInteger(ttl) || ttl < 0 || ttl > MAX_TTL_SECONDS) problem('expireAfterSeconds must be a whole number of seconds, 0 or more');
      const dates = [...DATE_FIELDS, ...fields.filter((f) => f.type === 'date').map((f) => f.key)];
      if (keys.length !== 1 || !dates.includes(keys[0].field) || text) problem(`a TTL index has one key, a date field: ${dates.join(', ')}`);
      if (index.unique) problem('a TTL index can’t be unique');
    }

    if (index.partialFilter !== undefined && index.partialFilter !== null) {
      try {
        const conditions = parseFilter(index.partialFilter);
        if (!conditions.length) problem('the partial filter is empty');
        for (const { op, value } of conditions) {
          if (!PARTIAL_FILTER_OPERATORS.includes(op)) problem(`a partial filter can use ${PARTIAL_FILTER_OPERATORS.join(' ')}, not ${op}`);
          if (op === '$exists' && value !== true) problem('$exists must be true in a partial filter');
        }
      } catch (error) {
        problem((error as Error).message);
      }
    }

    const pattern = JSON.stringify(keys.map((k) => [k.field, k.order]));
    const same = patterns.get(pattern);
    if (same) problem(`it has the same fields as ${same}`);
    else patterns.set(pattern, `index “${index.name}”`);
  }

  if (textIndexes > 1) issues.push({ message: 'A collection can have only one text index' });
  const total = indexes.length + uniqueKeys({ fields }).length;
  if (total > MAX_INDEXES_PER_COLLECTION) {
    issues.push({ message: `A collection can have at most ${MAX_INDEXES_PER_COLLECTION} indexes, unique fields included (this one would have ${total})` });
  }
  return issues;
}

/** Field names a record may write: no system fields, no operators, no dotted paths. */
export function writableFieldIssues(data: Record<string, unknown>): FieldIssue[] {
  return Object.keys(data).flatMap((key) => {
    if (SYSTEM_FIELDS.includes(key)) return [{ field: key, message: `${key} is set by the data store and can't be written` }];
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) return [{ field: key, message: `“${key}” is not a valid field name (letters, digits, _)` }];
    return [];
  });
}
