import { isNil, omitBy } from 'lodash';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { isPlainObject } from '../../../shared/util/json-setting';
import type { FieldIssue } from '../../../shared/schema/field-schema.types';
import { writableFieldIssues } from '../domain/data-collection';
import type { IndexOrder, IndexSpec } from '../domain/data-collection.types';

export const toValidationError = (issues: FieldIssue[]) => new ValidationFailedError(issues.map((i) => ({ message: i.message })));

/** Stored records never keep null/undefined fields: absent and null mean the same thing. */
export const withoutEmptyValues = (data: Record<string, unknown>) => omitBy(data, isNil);

/** 1, -1 and "text" as given; "1" / "-1" from a form as numbers; anything else is left for validation to name. */
const orderOf = (order: unknown): IndexOrder => (order === 'text' ? 'text' : Number(order) === 1 ? 1 : Number(order) === -1 ? -1 : (order as IndexOrder));

/**
 * Indexes in one stored shape (only the settings that are on, `order` as 1 / -1 / "text"), so a
 * definition that didn't change compares equal and stays the same in the database.
 */
export const normalizeIndexes = (indexes: IndexSpec[]): IndexSpec[] =>
  indexes.map((index) => ({
    name: String(index.name ?? '').trim(),
    keys: (index.keys ?? []).map(({ field, order }) => ({ field: String(field ?? '').trim(), order: orderOf(order) })),
    ...(index.unique ? { unique: true } : {}),
    ...(index.sparse ? { sparse: true } : {}),
    ...(isPlainObject(index.partialFilter) && Object.keys(index.partialFilter).length ? { partialFilter: index.partialFilter } : {}),
    ...(index.expireAfterSeconds !== undefined && index.expireAfterSeconds !== null ? { expireAfterSeconds: Number(index.expireAfterSeconds) } : {}),
  }));

/** The input as a record a user may write (an object without system or invalid field names). */
export function assertWritableRecord(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) throw new ValidationFailedError([{ message: 'A record must be a JSON object' }]);
  const issues = writableFieldIssues(input);
  if (issues.length) throw toValidationError(issues);
  return input;
}
