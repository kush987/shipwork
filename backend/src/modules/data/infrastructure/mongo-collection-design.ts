import { isEqual } from 'lodash';
import type { Document, IndexDescriptionInfo } from 'mongodb';
import { directMapping, toMongoFilter } from '../../../shared/query/mongo-record-query';
import { parseFilter } from '../../../shared/query/record-query';
import type { FieldSpec } from '../../../shared/schema/field-schema.types';
import { BUILT_IN_INDEX, DATE_FIELDS } from '../domain/data-collection.constants';
import { uniqueFieldIndexName, uniqueKeys } from '../domain/data-collection';
import type { DataCollection, IndexKey, IndexOrigin } from '../domain/data-collection.types';
import type { StoredCollection } from '../domain/data-collection.repository';
import type { RecordChange } from '../domain/record-update.types';
import { BSON_TYPES, MONGO_ERROR } from './mongo-collection-design.constants';
import type { WantedIndex } from './mongo-collection-design.types';

/** Records are stored as they are: `id` is `_id`, the user's fields at the top, the timestamps are Dates. */
export const NATIVE_MAPPING = directMapping(DATE_FIELDS);

/** The MongoDB validator for a collection's fields: their types, and the required ones. */
export function toValidator(fields: FieldSpec[]): Document {
  const properties: Record<string, Document> = {
    _id: { bsonType: 'string' },
    createdAt: { bsonType: 'date' },
    updatedAt: { bsonType: 'date' },
  };
  for (const field of fields) properties[field.key] = { bsonType: BSON_TYPES[field.type] };
  const required = ['_id', 'createdAt', 'updatedAt', ...fields.filter((f) => f.required).map((f) => f.key)];
  return { $jsonSchema: { bsonType: 'object', required, properties } };
}

const pathOf = (field: string) => (field === 'id' ? '_id' : field);

/** The indexes a collection should have: the built-in order index, one per unique field, then its custom ones. */
export function wantedIndexes(collection: Pick<DataCollection, 'fields' | 'indexes'>): WantedIndex[] {
  const builtIn: WantedIndex = { name: BUILT_IN_INDEX, origin: 'built-in', key: { createdAt: -1, _id: -1 }, options: {} };
  const unique = uniqueKeys(collection).map(
    (field): WantedIndex => ({
      name: uniqueFieldIndexName(field),
      origin: 'unique-field',
      key: { [field]: 1 },
      // Partial: records without the field don't count as sharing a value.
      options: { unique: true, partialFilterExpression: { [field]: { $exists: true } } },
    }),
  );
  const custom = (collection.indexes ?? []).map(
    (index): WantedIndex => ({
      name: index.name,
      origin: 'custom',
      key: Object.fromEntries(index.keys.map((k) => [pathOf(k.field), k.order])),
      options: {
        ...(index.unique ? { unique: true } : {}),
        ...(index.sparse ? { sparse: true } : {}),
        ...(index.partialFilter ? { partialFilterExpression: toMongoFilter(parseFilter(index.partialFilter), NATIVE_MAPPING) } : {}),
        ...(typeof index.expireAfterSeconds === 'number' ? { expireAfterSeconds: index.expireAfterSeconds } : {}),
      },
    }),
  );
  return [builtIn, ...unique, ...custom];
}

/** Fields of a key pattern that aren't full-text (text indexes store theirs as `_fts` / `_ftsx`). */
const plainKeys = (key: Document) => Object.entries(key).filter(([field, order]) => order !== 'text' && field !== '_fts' && field !== '_ftsx');

/** Does the database's index already do what the wanted one describes? */
export function sameIndex(existing: IndexDescriptionInfo, wanted: WantedIndex): boolean {
  const textFields = Object.keys(wanted.key).filter((field) => wanted.key[field] === 'text');
  if (textFields.length) {
    if (!('_fts' in existing.key)) return false;
    if (!isEqual(Object.keys(existing.weights ?? {}).sort(), [...textFields].sort())) return false;
    if (!isEqual(plainKeys(existing.key), plainKeys(wanted.key))) return false;
  } else if (!isEqual(Object.entries(existing.key), Object.entries(wanted.key))) {
    return false;
  }
  const { options } = wanted;
  return (
    !!existing.unique === !!options.unique &&
    !!existing.sparse === !!options.sparse &&
    isEqual(existing.partialFilterExpression ?? null, options.partialFilterExpression ?? null) &&
    (existing.expireAfterSeconds ?? null) === (options.expireAfterSeconds ?? null)
  );
}

/** An index's fields as users see them (`_id` is `id`; a text index's fields come from its weights). */
export function keysOf(index: IndexDescriptionInfo): IndexKey[] {
  const keys: IndexKey[] = [];
  for (const [field, order] of Object.entries(index.key)) {
    if (field === '_fts') keys.push(...Object.keys(index.weights ?? {}).map((f) => ({ field: f, order: 'text' as const })));
    else if (field !== '_ftsx') keys.push({ field: field === '_id' ? 'id' : field, order: order === -1 ? -1 : 1 });
  }
  return keys;
}

/** A wanted index's fields, in the order its definition gives them. */
export const wantedKeys = (wanted: WantedIndex): IndexKey[] =>
  Object.entries(wanted.key).map(([field, order]) => ({ field: field === '_id' ? 'id' : field, order: order as IndexKey['order'] }));

export function originOf(name: string, wanted: WantedIndex | undefined): IndexOrigin {
  if (name === '_id_') return 'built-in';
  return wanted?.origin ?? 'external';
}

/** The fields and value a duplicate-key error (E11000) is about. */
export function duplicateOf(error: unknown): { field: string; value: unknown } | null {
  const e = error as { code?: number; keyValue?: Record<string, unknown> };
  if (e?.code !== MONGO_ERROR.duplicateKey) return null;
  const entries = Object.entries(e.keyValue ?? {});
  if (!entries.length) return { field: 'value', value: undefined };
  if (entries.length === 1) return { field: entries[0][0], value: entries[0][1] };
  return { field: entries.map(([field]) => field).join(' + '), value: Object.fromEntries(entries) };
}

export const mongoCode = (error: unknown) => (error as { code?: number })?.code;

// ---- records: dates, fields to return, updates --------------------------------------------------

/** The fields stored as real dates: the timestamps and the collection's date fields. */
export const dateFieldsOf = (collection: StoredCollection) => [...DATE_FIELDS, ...collection.fields.filter((f) => f.type === 'date').map((f) => f.key)];

/** Where each query field lives and how its values are stored, for one collection (its date fields included). */
export const mappingFor = (collection: StoredCollection) => directMapping(dateFieldsOf(collection));

/** ISO text in date fields → Date, as the database stores them. */
export function toStoredDates(data: Record<string, unknown>, dateFields: string[]): Record<string, unknown> {
  const out = { ...data };
  for (const field of dateFields) {
    const value = out[field];
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) out[field] = new Date(value);
  }
  return out;
}

/** Search relevance travels in this field until the record is read back (then it's dropped). */
export const SCORE_FIELD = '__score';

/** A projection for `fields` (id and the timestamps always come along), plus the search score. */
export function projectionOf(fields: string[] | undefined, relevance: boolean): Document | undefined {
  if (!fields?.length && !relevance) return undefined;
  return {
    ...(fields?.length ? Object.fromEntries([...fields.map((f) => (f === 'id' ? '_id' : f)), 'createdAt', 'updatedAt'].map((f) => [f, 1])) : {}),
    ...(relevance ? { [SCORE_FIELD]: { $meta: 'textScore' } } : {}),
  };
}

/** A checked change as a MongoDB update; an upsert also gets the new record's id and createdAt. */
export function toMongoUpdate(change: RecordChange, dateFields: string[], now: Date, insert?: { id: string }): Document {
  const dates = (values: Record<string, unknown>) => toStoredDates(values, dateFields);
  const nonEmpty = (op: string, value: Record<string, unknown>) => (Object.keys(value).length ? { [op]: value } : {});
  return {
    $set: { ...dates(change.set), updatedAt: now },
    ...(change.unset.length ? { $unset: Object.fromEntries(change.unset.map((f) => [f, ''])) } : {}),
    ...nonEmpty('$inc', change.inc),
    ...nonEmpty('$mul', change.mul),
    ...nonEmpty('$min', dates(change.min)),
    ...nonEmpty('$max', dates(change.max)),
    ...nonEmpty(
      '$push',
      Object.fromEntries(
        Object.entries(change.push).map(([f, p]) => [f, { $each: p.each, ...(p.slice !== undefined ? { $slice: p.slice } : {}), ...(p.position !== undefined ? { $position: p.position } : {}) }]),
      ),
    ),
    ...nonEmpty('$addToSet', Object.fromEntries(Object.entries(change.addToSet).map(([f, each]) => [f, { $each: each }]))),
    ...nonEmpty('$pull', change.pull),
    ...(change.currentDate.length ? { $currentDate: Object.fromEntries(change.currentDate.map((f) => [f, true])) } : {}),
    ...(insert ? { $setOnInsert: { ...dates(change.setOnInsert), _id: insert.id, createdAt: now } } : {}),
  };
}

/** ISO text compared with date fields in a pipeline's $match stages → Date, so `{"createdAt": {"$gte": "2026-11-01"}}` works. */
export function withPipelineDates(pipeline: Document[], dateFields: string[]): Document[] {
  const convert = (value: unknown): unknown => {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value);
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k.startsWith('$') ? convert(v) : v]));
    return value;
  };
  const match = (filter: Document): Document =>
    Object.fromEntries(
      Object.entries(filter).map(([key, value]) => {
        if (key === '$and' || key === '$or' || key === '$nor') return [key, Array.isArray(value) ? value.map((f) => match(f as Document)) : value];
        return [key, dateFields.includes(key) ? convert(value) : value];
      }),
    );
  return pipeline.map((stage) => ('$match' in stage && stage.$match && typeof stage.$match === 'object' ? { $match: match(stage.$match as Document) } : stage));
}

/** What MongoDB's validator said about a refused record, in words: missing fields, wrong types. */
export function describeRefusal(error: unknown): string {
  const details = (error as { errInfo?: { details?: { schemaRulesNotSatisfied?: Document[] } } })?.errInfo?.details?.schemaRulesNotSatisfied ?? [];
  const problems: string[] = [];
  for (const rule of details) {
    if (rule.operatorName === 'required') problems.push(...(rule.missingProperties ?? []).map((f: string) => `${f} is required`));
    if (rule.operatorName === 'properties') problems.push(...(rule.propertiesNotSatisfied ?? []).map((p: Document) => `${p.propertyName} has the wrong type`));
  }
  return problems.length ? problems.join('; ') : 'it doesn’t match the collection’s fields';
}

/** Dates (top level or nested) as ISO text, the way records are returned. */
export const isoDates = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(isoDates);
  if (value && typeof value === 'object' && value.constructor === Object) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, isoDates(v)]));
  return value;
};

/** A number without binary floating-point noise (20.419999999999998 → 20.42); anything else as it is. */
export const withoutNoise = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value) ? Number(value.toFixed(10)) : value);
