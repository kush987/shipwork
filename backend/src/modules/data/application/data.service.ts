import { Injectable } from '@nestjs/common';
import { InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { normalizeFieldSpecs, validateFields } from '../../../shared/schema/field-schema';
import { collectionIssues, collectionNameRule, indexIssues } from '../domain/data-collection';
import { COLLECTION_NAME } from '../domain/data-collection.constants';
import { buildQuery, parseFields, parseFilter } from '../../../shared/query/record-query';
import { FIELD_PATH } from '../../../shared/query/record-query.constants';
import { SAMPLE_COLLECTIONS } from './data-samples.constants';
import { ChangeOptions, ManyInput, RecordListInput } from './data.service.types';
import { parseUpdate } from '../domain/record-update';
import type { ManyResult, RecordChange, RecordTarget, UpdateResult } from '../domain/record-update.types';
import { checkPipeline } from '../domain/aggregation-pipeline';
import { MAX_AGGREGATE_RESULTS } from '../domain/aggregation-pipeline.constants';
import { MAX_DISTINCT } from '../domain/data-collection.constants';
import { coerceText } from '../../../shared/schema/field-schema';
import { CollectionInput, DataCollection, DataRecord, IndexSpec } from '../domain/data-collection.types';
import { DataCollectionRepository, DataRecordRepository } from '../domain/data-collection.repository';
import { requireFound } from '../../../shared/domain/guards';
import { assertWritableRecord, normalizeIndexes, withoutEmptyValues, toValidationError } from './data.helpers';
import { hashPassword } from '../../../shared/security/passwords';

/** Sample users carry a readable password; only its hash is stored. */
async function withHashedPassword({ password, ...record }: Record<string, unknown>) {
  return typeof password === 'string' ? { ...record, passwordHash: await hashPassword(password) } : record;
}

/**
 * Use cases of the built-in data store. Used by the REST API (Data page) and by the data nodes in
 * workflows, so both apply the same schema checks and query rules. Each collection is a database
 * collection of its own; its definition (fields, indexes) is what the database is kept in step with.
 */
@Injectable()
export class DataService {
  constructor(
    private readonly collections: DataCollectionRepository,
    private readonly records: DataRecordRepository,
  ) {}

  // ---- collections ---------------------------------------------------------------------------

  async listCollections(tenantId: string) {
    const collections = await this.collections.list(tenantId);
    const counts = await this.records.counts(
      tenantId,
      collections.map((c) => c.name),
    );
    return collections.map((c) => ({ ...c, recordCount: counts[c.name] ?? 0 }));
  }

  async getCollection(tenantId: string, name: string): Promise<DataCollection> {
    return requireFound(await this.collections.findByName(tenantId, name), 'Collection', name);
  }

  async collectionExists(tenantId: string, name: string) {
    return !!(await this.collections.findByName(tenantId, name));
  }

  countCollections(tenantId: string) {
    return this.collections.count(tenantId);
  }

  async createCollection(tenantId: string, input: CollectionInput): Promise<DataCollection> {
    const issues = collectionIssues(input, true);
    if (issues.length) throw new ValidationFailedError(issues);
    if (await this.collections.findByName(tenantId, input.name!)) throw new InvalidOperationError(`A collection named “${input.name}” already exists`);
    const fields = normalizeFieldSpecs(input.fields, { allowUnique: true });
    const indexes = normalizeIndexes(input.indexes ?? []);
    const indexProblems = indexIssues(indexes, fields);
    if (indexProblems.length) throw new ValidationFailedError(indexProblems);
    const now = new Date().toISOString();
    const collection: DataCollection = {
      id: newId('col'),
      tenantId,
      name: input.name!,
      label: input.label?.trim() || input.name!,
      description: input.description?.trim() ?? '',
      fields,
      indexes,
      createdAt: now,
      updatedAt: now,
    };
    // The database collection first (validator, indexes), so a definition never exists without it.
    await this.records.prepare(tenantId, collection);
    await this.collections.create(collection);
    return collection;
  }

  /** Changes the label, description, fields and (when given) the custom indexes. */
  async updateCollection(tenantId: string, name: string, input: CollectionInput): Promise<DataCollection> {
    const collection = await this.getCollection(tenantId, name);
    const issues = collectionIssues(input, false);
    if (issues.length) throw new ValidationFailedError(issues);
    const updated: DataCollection = {
      ...collection,
      label: input.label?.trim() || collection.label,
      description: input.description?.trim() ?? collection.description,
      fields: input.fields ? normalizeFieldSpecs(input.fields, { allowUnique: true }) : collection.fields,
      indexes: input.indexes ? normalizeIndexes(input.indexes) : collection.indexes,
      updatedAt: new Date().toISOString(),
    };
    return this.apply(tenantId, collection, updated);
  }

  async deleteCollection(tenantId: string, name: string) {
    await this.getCollection(tenantId, name);
    await this.records.drop(tenantId, name);
    await this.collections.delete(tenantId, name);
  }

  /** Renames a collection and its database collection. Workflows that use the old name must be updated. */
  async renameCollection(tenantId: string, name: string, to: string): Promise<DataCollection> {
    const collection = await this.getCollection(tenantId, name);
    if (to === name) return collection;
    if (!COLLECTION_NAME.test(to ?? '')) throw new ValidationFailedError([{ message: collectionNameRule }]);
    if (await this.collections.findByName(tenantId, to)) throw new InvalidOperationError(`A collection named “${to}” already exists`);
    await this.records.rename(tenantId, name, to);
    const renamed = { ...collection, name: to, updatedAt: new Date().toISOString() };
    await this.collections.save(renamed);
    return renamed;
  }

  // ---- indexes and stats -----------------------------------------------------------------------

  async listIndexes(tenantId: string, name: string) {
    return this.records.indexes(tenantId, await this.getCollection(tenantId, name));
  }

  /** Builds a custom index (refused, with nothing changed, when e.g. a unique one meets shared values). */
  async addIndex(tenantId: string, name: string, index: IndexSpec) {
    const collection = await this.getCollection(tenantId, name);
    if (collection.indexes.some((i) => i.name === index.name)) throw new InvalidOperationError(`“${name}” already has an index named “${index.name}”`);
    await this.apply(tenantId, collection, { ...collection, indexes: [...collection.indexes, index], updatedAt: new Date().toISOString() });
    return this.listIndexes(tenantId, name);
  }

  async dropIndex(tenantId: string, name: string, indexName: string) {
    const collection = await this.getCollection(tenantId, name);
    if (!collection.indexes.some((i) => i.name === indexName)) {
      throw new NotFoundError(`Custom index of ${name}`, indexName);
    }
    await this.apply(tenantId, collection, { ...collection, indexes: collection.indexes.filter((i) => i.name !== indexName), updatedAt: new Date().toISOString() });
  }

  async collectionStats(tenantId: string, name: string) {
    await this.getCollection(tenantId, name);
    return this.records.stats(tenantId, name);
  }

  /**
   * Checks a changed definition, brings the database in step (custom indexes it no longer has are
   * dropped, new ones built), then saves it. If the database refuses (shared values for a new unique
   * index), the definition is left as it was.
   */
  private async apply(tenantId: string, current: DataCollection, changed: DataCollection): Promise<DataCollection> {
    const wanted = { ...changed, indexes: normalizeIndexes(changed.indexes) };
    const problems = indexIssues(wanted.indexes, wanted.fields);
    if (problems.length) throw new ValidationFailedError(problems);
    const kept = new Set(wanted.indexes.map((i) => JSON.stringify(i)));
    for (const index of current.indexes) {
      if (!kept.has(JSON.stringify(index))) await this.records.dropIndex(tenantId, current.name, index.name);
    }
    await this.records.prepare(tenantId, wanted);
    await this.collections.save(wanted);
    return wanted;
  }

  // ---- records -------------------------------------------------------------------------------

  async listRecords(tenantId: string, name: string, input: RecordListInput) {
    const collection = await this.getCollection(tenantId, name);
    const query = buildQuery(input);
    const [records, total] = await Promise.all([this.records.find(tenantId, collection, query), this.records.count(tenantId, collection, query)]);
    return { total, records };
  }

  async findRecords(tenantId: string, name: string, input: RecordListInput): Promise<DataRecord[]> {
    const collection = await this.getCollection(tenantId, name);
    return this.records.find(tenantId, collection, buildQuery(input));
  }

  async getRecord(tenantId: string, name: string, id: string, fields?: unknown): Promise<DataRecord | null> {
    const collection = await this.getCollection(tenantId, name);
    return this.records.get(tenantId, collection, id, parseFields(fields));
  }

  async requireRecord(tenantId: string, name: string, id: string, fields?: unknown): Promise<DataRecord> {
    return requireFound(await this.getRecord(tenantId, name, id, fields), `Record in ${name}`, id);
  }

  async createRecord(tenantId: string, name: string, input: unknown): Promise<DataRecord> {
    const collection = await this.getCollection(tenantId, name);
    const data = assertWritableRecord(input);
    // `value` has dates in one form (ISO text); the store keeps them as dates.
    const { value, issues } = validateFields(collection.fields, data);
    if (issues.length) throw toValidationError(issues);
    await this.records.prepare(tenantId, collection);
    return this.records.insert(tenantId, collection, withoutEmptyValues(value));
  }

  /** Merges `changes` into the record; a `null` value removes that field. Null when it doesn't exist. */
  async updateRecord(tenantId: string, name: string, id: string, changes: unknown): Promise<DataRecord | null> {
    const collection = await this.getCollection(tenantId, name);
    const change = this.change(collection, assertWritableRecord(changes));
    await this.records.prepare(tenantId, collection);
    return (await this.records.update(tenantId, collection, { id }, change)).record;
  }

  /**
   * Applies a change written as MongoDB does (`$set`, `$inc`, `$push`, `$addToSet`, `$pull`, `$min`,
   * `$max`, `$mul`, `$unset`, `$currentDate`, `$setOnInsert`) to one record — by id, or the newest whose
   * field equals a value. `onlyIf` is checked and written at once (atomic); `upsert` creates the record
   * when nothing matches. The outcome tells which happened: updated, created, not_found or unmet.
   */
  async changeRecord(tenantId: string, name: string, target: RecordTarget, update: unknown, options: ChangeOptions = {}): Promise<UpdateResult> {
    const collection = await this.getCollection(tenantId, name);
    const change = this.change(collection, update);
    const onlyIf = parseFilter(options.onlyIf);
    const issues: string[] = [];
    if (options.upsert && 'id' in target) issues.push('Creating a missing record needs a field to find it by (e.g. sellerId), not an id');
    if (options.upsert && onlyIf.length) issues.push('“Only if” and creating a missing record can’t be combined');
    if (!options.upsert && Object.keys(change.setOnInsert).length) issues.push('$setOnInsert only applies when a missing record is created (upsert)');
    const resolved = 'field' in target ? { field: target.field, value: this.findValue(collection, target.field, target.value, issues) } : target;
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
    await this.records.prepare(tenantId, collection);
    return this.records.update(tenantId, collection, resolved, change, { onlyIf, upsert: !!options.upsert });
  }

  /** Applies one change to every record the filter matches. */
  async updateMany(tenantId: string, name: string, input: ManyInput & { update: unknown }): Promise<ManyResult> {
    const collection = await this.getCollection(tenantId, name);
    const conditions = this.manyFilter(input);
    const change = this.change(collection, input.update);
    if (Object.keys(change.setOnInsert).length) throw new ValidationFailedError([{ message: '$setOnInsert only applies when a missing record is created' }]);
    await this.records.prepare(tenantId, collection);
    return this.records.updateMany(tenantId, collection, conditions, change);
  }

  async deleteMany(tenantId: string, name: string, input: ManyInput): Promise<{ deleted: number }> {
    const collection = await this.getCollection(tenantId, name);
    return { deleted: await this.records.deleteMany(tenantId, collection, this.manyFilter(input)) };
  }

  /** The different values of a field (each list item counts on its own), among records matching the filter. */
  async distinct(tenantId: string, name: string, field: string, filter?: unknown) {
    const collection = await this.getCollection(tenantId, name);
    if (field !== 'id' && !FIELD_PATH.test(field ?? '')) throw new ValidationFailedError([{ message: `“${field}” is not a field name` }]);
    const values = await this.records.distinct(tenantId, collection, field, parseFilter(filter), MAX_DISTINCT + 1);
    return { field, values: values.slice(0, MAX_DISTINCT), truncated: values.length > MAX_DISTINCT };
  }

  /** Runs a MongoDB aggregation pipeline over the collection (reading stages only; see checkPipeline). */
  async aggregate(tenantId: string, name: string, rawPipeline: unknown) {
    const collection = await this.getCollection(tenantId, name);
    const names = (await this.collections.list(tenantId)).map((c) => c.name);
    const { pipeline, issues } = checkPipeline(rawPipeline, names);
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
    return this.records.aggregate(tenantId, collection, pipeline, MAX_AGGREGATE_RESULTS);
  }

  async deleteRecord(tenantId: string, name: string, id: string): Promise<boolean> {
    const collection = await this.getCollection(tenantId, name);
    return this.records.delete(tenantId, collection, id);
  }

  /** A change checked against the collection's fields (every problem reported at once). */
  change(collection: DataCollection, update: unknown): RecordChange {
    const { change, issues } = parseUpdate(update, collection.fields);
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
    return change;
  }

  /** The value a field target must equal, read as the field's declared type ("42" → 42). */
  findValue(collection: DataCollection, field: string, value: unknown, issues: string[]): unknown {
    if (!FIELD_PATH.test(field ?? '') || field === 'id') issues.push(`“${field}” is not a field to find a record by`);
    if (value === undefined || value === null || value === '' || !['string', 'number', 'boolean'].includes(typeof value)) {
      issues.push(`The value to find by ${field} must be text, a number or true/false`);
    }
    const declared = collection.fields.find((f) => f.key === field);
    return declared ? coerceText(value, declared.type) : value;
  }

  private manyFilter(input: ManyInput) {
    const conditions = parseFilter(input.filter);
    if (!conditions.length && input.all !== true) throw new ValidationFailedError([{ message: 'Give a filter — or all: true to change every record' }]);
    return conditions;
  }

  /** Adds the sample collections (with records) the API templates use, skipping existing ones. */
  async seedSamples(tenantId: string) {
    const created: string[] = [];
    for (const sample of SAMPLE_COLLECTIONS) {
      if (await this.collectionExists(tenantId, sample.name)) continue;
      await this.createCollection(tenantId, sample);
      const collection = await this.getCollection(tenantId, sample.name);
      for (const record of sample.records) await this.records.insert(tenantId, collection, await withHashedPassword(record));
      created.push(sample.name);
    }
    return { created };
  }
}
