import { Injectable } from '@nestjs/common';
import { get, set } from 'lodash';
import type { ClientSession, Collection, Db, Document, IndexDescriptionInfo, MongoClient, Sort } from 'mongodb';
import { newId } from '../../../shared/domain/id';
import { InvalidOperationError, ValidationFailedError } from '../../../shared/domain/errors';
import { DataCollectionDoc, DataCollectionSchema } from './data.schema';
import { TenantModels } from '../../../shared/tenancy/tenant-models.ports';
import { toMongoFilter, toMongoSort } from '../../../shared/query/mongo-record-query';
import { CollectionStats, DataCollection, IndexInfo } from '../domain/data-collection.types';
import { DataCollectionRepository, DataRecordRepository } from '../domain/data-collection.repository';
import type { RecordWrites, StoredCollection } from '../domain/data-collection.repository';
import type { ManyResult, RecordChange, RecordTarget, UpdateOptions } from '../domain/record-update.types';
import type { FilterCondition, RecordQuery } from '../../../shared/query/record-query.types';
import { newDocument, toCollection, toCollectionDoc, toRecord } from './data.mapper';
import { DuplicateValueError, UniqueConflictError } from '../domain/data-collection.errors';
import { physicalName } from '../domain/data-collection';
import { BUILT_IN_INDEX, UNIQUE_FIELD_INDEX_PREFIX } from '../domain/data-collection.constants';
import {
  dateFieldsOf,
  describeRefusal,
  duplicateOf,
  isoDates,
  keysOf,
  mappingFor,
  mongoCode,
  originOf,
  projectionOf,
  sameIndex,
  SCORE_FIELD,
  toMongoUpdate,
  toStoredDates,
  toValidator,
  wantedIndexes,
  wantedKeys,
  withPipelineDates,
  withoutNoise,
} from './mongo-collection-design';
import { AGGREGATE_TIMEOUT_MS } from '../domain/aggregation-pipeline.constants';
import { MONGO_ERROR, VALIDATION } from './mongo-collection-design.constants';
import type { RecordDocument, WantedIndex } from './mongo-collection-design.types';
import { LegacyRecordsMigrator } from './legacy-records-migrator';

/** Collection definitions live in each workspace's own database. */
@Injectable()
export class MongoDataCollectionRepository extends DataCollectionRepository {
  constructor(private readonly models: TenantModels) {
    super();
  }

  private collections(tenantId: string) {
    return this.models.model<DataCollectionDoc>(tenantId, DataCollectionDoc.name, DataCollectionSchema);
  }

  async create(c: DataCollection) {
    await (await this.collections(c.tenantId)).create(toCollectionDoc(c));
  }

  async save(c: DataCollection) {
    await (await this.collections(c.tenantId)).replaceOne({ _id: c.id, tenantId: c.tenantId }, toCollectionDoc(c));
  }

  async findByName(tenantId: string, name: string) {
    const doc = await (await this.collections(tenantId)).findOne({ tenantId, name }).lean();
    return doc ? toCollection(doc) : null;
  }

  async list(tenantId: string) {
    return (await (await this.collections(tenantId)).find({ tenantId }).sort({ name: 1 }).lean()).map(toCollection);
  }

  async delete(tenantId: string, name: string) {
    await (await this.collections(tenantId)).deleteOne({ tenantId, name });
  }

  async count(tenantId: string) {
    return (await this.collections(tenantId)).countDocuments({ tenantId });
  }
}

const ignoring =
  (...codes: number[]) =>
  (error: unknown) => {
    if (codes.includes(mongoCode(error) ?? -1)) return undefined;
    throw error;
  };

/**
 * Each data collection is a MongoDB collection of its own in the workspace's database,
 * `data.<name>`, holding plain documents: `{ _id, …fields, createdAt, updatedAt }`. The database
 * enforces the field types and required fields (validator) and the indexes the definition asks for.
 */
@Injectable()
export class MongoDataRecordRepository extends DataRecordRepository {
  /** Per database: the definition (fields + indexes) each collection was last prepared for. */
  private readonly prepared = new WeakMap<Db, Map<string, string>>();

  constructor(
    private readonly models: TenantModels,
    private readonly legacy: LegacyRecordsMigrator,
  ) {
    super();
  }

  /** The workspace's connection and database, with any records of the old shared layout moved over first. */
  private async connection(tenantId: string): Promise<{ db: Db; client: MongoClient }> {
    const connection = (await this.models.model<DataCollectionDoc>(tenantId, DataCollectionDoc.name, DataCollectionSchema)).db;
    const db = connection.db;
    if (!db) throw new Error('Database connection is not open');
    await this.legacy.ensure(tenantId, db, (target, collection) => this.prepareOn(target, collection));
    return { db, client: connection.getClient() as unknown as MongoClient };
  }

  private async db(tenantId: string): Promise<Db> {
    return (await this.connection(tenantId)).db;
  }

  private async records(tenantId: string, collection: string): Promise<Collection<RecordDocument>> {
    return (await this.db(tenantId)).collection<RecordDocument>(physicalName(collection));
  }

  insert(tenantId: string, collection: StoredCollection, data: Record<string, unknown>) {
    return this.insertWith(tenantId, collection, data);
  }

  private async insertWith(tenantId: string, collection: StoredCollection, data: Record<string, unknown>, session?: ClientSession) {
    const doc = newDocument(newId('rec'), toStoredDates(data, dateFieldsOf(collection)), new Date());
    const records = await this.records(tenantId, collection.name);
    await this.write(collection.name, () => records.insertOne(doc, { session }));
    return toRecord(doc);
  }

  async find(tenantId: string, collection: StoredCollection, query: RecordQuery) {
    const mapping = mappingFor(collection);
    const records = await this.records(tenantId, collection.name);
    const sort = query.relevance ? { [SCORE_FIELD]: { $meta: 'textScore' }, ...toMongoSort(query.sort, mapping) } : toMongoSort(query.sort, mapping);
    const docs = await this.read(collection.name, () =>
      records
        .find(toMongoFilter(query.conditions, mapping), { projection: projectionOf(query.fields, !!query.relevance) })
        .sort(sort as Sort)
        .skip(query.skip)
        .limit(query.limit)
        .toArray(),
    );
    return docs.map(toRecord);
  }

  async count(tenantId: string, collection: StoredCollection, query: Pick<RecordQuery, 'conditions'>) {
    const records = await this.records(tenantId, collection.name);
    return this.read(collection.name, () => records.countDocuments(toMongoFilter(query.conditions, mappingFor(collection))));
  }

  async get(tenantId: string, collection: StoredCollection, id: string, fields?: string[]) {
    const doc = await (await this.records(tenantId, collection.name)).findOne({ _id: id }, { projection: projectionOf(fields, false) });
    return doc ? toRecord(doc) : null;
  }

  update(tenantId: string, collection: StoredCollection, target: RecordTarget, change: RecordChange, options: UpdateOptions = {}) {
    return this.updateWith(tenantId, collection, target, change, options);
  }

  private async updateWith(tenantId: string, collection: StoredCollection, target: RecordTarget, change: RecordChange, options: UpdateOptions, session?: ClientSession) {
    const mapping = mappingFor(collection);
    const dateFields = dateFieldsOf(collection);
    const records = await this.records(tenantId, collection.name);
    const selector: Document = 'id' in target ? { _id: target.id } : toMongoFilter([{ field: target.field, op: '$eq', value: target.value }], mapping);
    const filter = options.onlyIf?.length ? { ...toMongoFilter(options.onlyIf, mapping), ...selector } : selector;
    const update = toMongoUpdate(change, dateFields, new Date(), options.upsert ? { id: newId('rec') } : undefined);
    const result = await this.write(collection.name, () =>
      records.findOneAndUpdate(filter, update, {
        returnDocument: 'after',
        upsert: !!options.upsert,
        // A field can match several records: the newest is the one, as for Get record.
        sort: { createdAt: -1, _id: -1 },
        includeResultMetadata: true,
        session,
      }),
    );
    if (result.value) {
      const doc = await this.withoutFloatNoise(records, result.value, change, session);
      return { outcome: result.lastErrorObject?.upserted ? ('created' as const) : ('updated' as const), record: toRecord(doc) };
    }
    if (!options.onlyIf?.length) return { outcome: 'not_found' as const, record: null };
    const exists = await records.countDocuments(selector, { limit: 1, session });
    return { outcome: exists ? ('unmet' as const) : ('not_found' as const), record: null };
  }

  /**
   * $inc / $mul on decimals add binary floating-point noise (100 − 30.42 − 49.16 → 20.419999999999998).
   * Such a result is set to its value rounded to 10 places — only if it is still the same number, so a
   * change made in between is never overwritten.
   */
  private async withoutFloatNoise(records: Collection<RecordDocument>, doc: RecordDocument, change: RecordChange, session?: ClientSession) {
    const fixes: Record<string, number> = {};
    for (const path of [...Object.keys(change.inc), ...Object.keys(change.mul)]) {
      const value: unknown = get(doc, path);
      if (typeof value !== 'number') continue;
      const clean = withoutNoise(value) as number;
      if (clean !== value) fixes[path] = clean;
    }
    if (!Object.keys(fixes).length) return doc;
    const guard = Object.fromEntries(Object.keys(fixes).map((path) => [path, get(doc, path)]));
    await records.updateOne({ _id: doc._id, ...guard }, { $set: fixes }, { session });
    for (const [path, value] of Object.entries(fixes)) set(doc, path, value);
    return doc;
  }

  async updateMany(tenantId: string, collection: StoredCollection, conditions: FilterCondition[], change: RecordChange): Promise<ManyResult> {
    const records = await this.records(tenantId, collection.name);
    const result = await this.write(collection.name, () =>
      records.updateMany(toMongoFilter(conditions, mappingFor(collection)), toMongoUpdate(change, dateFieldsOf(collection), new Date())),
    );
    return { matched: result.matchedCount, modified: result.modifiedCount };
  }

  delete(tenantId: string, collection: StoredCollection, id: string) {
    return this.deleteWith(tenantId, collection, id);
  }

  private async deleteWith(tenantId: string, collection: StoredCollection, id: string, session?: ClientSession) {
    return (await (await this.records(tenantId, collection.name)).deleteOne({ _id: id }, { session })).deletedCount === 1;
  }

  async deleteMany(tenantId: string, collection: StoredCollection, conditions: FilterCondition[]) {
    const records = await this.records(tenantId, collection.name);
    return (await this.read(collection.name, () => records.deleteMany(toMongoFilter(conditions, mappingFor(collection))))).deletedCount;
  }

  async distinct(tenantId: string, collection: StoredCollection, field: string, conditions: FilterCondition[], limit: number) {
    const records = await this.records(tenantId, collection.name);
    const values = await this.read(collection.name, () => records.distinct(field === 'id' ? '_id' : field, toMongoFilter(conditions, mappingFor(collection))));
    return (isoDates(values) as unknown[]).slice(0, limit);
  }

  async aggregate(tenantId: string, collection: StoredCollection, pipeline: Document[], limit: number) {
    const records = await this.records(tenantId, collection.name);
    const staged = [...withPipelineDates(pipeline, dateFieldsOf(collection)), { $limit: limit + 1 }];
    const results = await this.read(collection.name, () => records.aggregate(staged, { maxTimeMS: AGGREGATE_TIMEOUT_MS, allowDiskUse: false }).toArray(), 'pipeline');
    return { results: (isoDates(results.slice(0, limit)) as Document[]), truncated: results.length > limit };
  }

  async transaction<T>(tenantId: string, work: (writes: RecordWrites) => Promise<T>): Promise<T> {
    const { client } = await this.connection(tenantId);
    const session = client.startSession();
    const writes: RecordWrites = {
      insert: (t, collection, data) => this.insertWith(t, collection, data, session),
      update: (t, collection, target, change, options = {}) => this.updateWith(t, collection, target, change, options, session),
      delete: (t, collection, id) => this.deleteWith(t, collection, id, session),
    };
    try {
      let outcome: T | undefined;
      // Retries `work` when its writes conflict with others (TransientTransactionError), then commits.
      await session.withTransaction(async () => {
        outcome = await work(writes);
      });
      return outcome as T;
    } catch (error) {
      if (mongoCode(error) === MONGO_ERROR.illegalOperation && /replica set|Transaction numbers/i.test((error as Error).message)) {
        throw new InvalidOperationError('Transactions need MongoDB running as a replica set (the docker-compose MongoDB is one; a standalone server can’t do them)');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async counts(tenantId: string, collections: string[]) {
    const db = await this.db(tenantId);
    const counts = await Promise.all(collections.map((name) => db.collection(physicalName(name)).estimatedDocumentCount()));
    return Object.fromEntries(collections.map((name, i) => [name, counts[i]]));
  }

  async prepare(tenantId: string, collection: DataCollection) {
    await this.prepareOn(await this.db(tenantId), collection);
  }

  private async prepareOn(db: Db, collection: DataCollection) {
    const signature = JSON.stringify([collection.fields, collection.indexes]);
    const done = this.prepared.get(db) ?? new Map<string, string>();
    this.prepared.set(db, done);
    if (done.get(collection.name) === signature) return;

    const name = physicalName(collection.name);
    const validator = toValidator(collection.fields);
    // On a replica set the collection keeps each record's state before a change, so record-changed
    // triggers can pass the previous record for updates and deletes.
    const images = (await this.isReplicaSet(db)) ? { changeStreamPreAndPostImages: { enabled: true } } : {};
    const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
    if (exists) await db.command({ collMod: name, validator, ...VALIDATION, ...images });
    else {
      await db.createCollection(name, { validator, ...VALIDATION, ...images }).catch(async (error: unknown) => {
        if (mongoCode(error) !== MONGO_ERROR.namespaceExists) throw error;
        await db.command({ collMod: name, validator, ...VALIDATION, ...images });
      });
    }

    const records = db.collection<RecordDocument>(name);
    const existing = await records.listIndexes().toArray();
    const wanted = wantedIndexes(collection);
    // Ours that are no longer wanted (a field stopped being unique) or now mean something else go first.
    for (const index of existing) {
      const want = wanted.find((w) => w.name === index.name);
      const ours = index.name === BUILT_IN_INDEX || String(index.name).startsWith(UNIQUE_FIELD_INDEX_PREFIX);
      if ((ours && !want) || (want && !sameIndex(index, want))) await records.dropIndex(String(index.name));
    }
    for (const want of wanted) {
      if (existing.some((index) => index.name === want.name && sameIndex(index, want))) continue;
      await this.build(records, collection.name, want);
    }
    done.set(collection.name, signature);
  }

  private readonly replicaSet = new WeakMap<Db, Promise<boolean>>();

  /** Whether the database is a replica set member (transactions, change streams and pre-images need one). */
  private isReplicaSet(db: Db): Promise<boolean> {
    let known = this.replicaSet.get(db);
    if (!known) {
      known = db
        .admin()
        .command({ hello: 1 })
        .then((hello) => !!hello.setName)
        .catch(() => false);
      this.replicaSet.set(db, known);
    }
    return known;
  }

  /** Builds one index; a unique one is refused with a clear message when records already share a value. */
  private async build(records: Collection<RecordDocument>, collection: string, want: WantedIndex) {
    if (want.options.unique) await this.assertNoShared(records, collection, want);
    try {
      await records.createIndex(want.key, { name: want.name, ...want.options });
    } catch (error) {
      const duplicate = duplicateOf(error);
      if (duplicate) throw new UniqueConflictError(collection, duplicate.field, duplicate.value, 2);
      const code = mongoCode(error);
      if (code === MONGO_ERROR.indexOptionsConflict || code === MONGO_ERROR.indexKeySpecsConflict) {
        throw new InvalidOperationError(`MongoDB refused index “${want.name}”: ${(error as Error).message}`);
      }
      throw error;
    }
  }

  private async assertNoShared(records: Collection<RecordDocument>, collection: string, want: WantedIndex) {
    const fields = Object.keys(want.key);
    const match = want.options.partialFilterExpression ?? (want.options.sparse ? Object.fromEntries(fields.map((f) => [f, { $exists: true }])) : {});
    const [shared] = await records
      .aggregate<{ _id: Record<string, unknown>; n: number }>([
        { $match: match },
        { $group: { _id: Object.fromEntries(fields.map((f) => [f.replace(/\./g, '_'), `$${f}`])), n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $limit: 1 },
      ])
      .toArray();
    if (!shared) return;
    const values = Object.values(shared._id);
    throw new UniqueConflictError(collection, fields.join(' + '), values.length === 1 ? values[0] : shared._id, shared.n);
  }

  async dropIndex(tenantId: string, collection: string, index: string) {
    const db = await this.db(tenantId);
    await db
      .collection(physicalName(collection))
      .dropIndex(index)
      .catch(ignoring(MONGO_ERROR.indexNotFound, MONGO_ERROR.namespaceNotFound));
    this.prepared.get(db)?.delete(collection);
  }

  async drop(tenantId: string, collection: string) {
    const db = await this.db(tenantId);
    await db
      .collection(physicalName(collection))
      .drop()
      .catch(ignoring(MONGO_ERROR.namespaceNotFound));
    this.prepared.get(db)?.delete(collection);
  }

  async rename(tenantId: string, from: string, to: string) {
    const db = await this.db(tenantId);
    const exists = (await db.listCollections({ name: physicalName(from) }, { nameOnly: true }).toArray()).length > 0;
    if (exists) {
      await db.renameCollection(physicalName(from), physicalName(to)).catch((error: unknown) => {
        if (mongoCode(error) === MONGO_ERROR.namespaceExists) throw new InvalidOperationError(`The database already has a collection ${physicalName(to)}`);
        throw error;
      });
    }
    this.prepared.get(db)?.delete(from);
  }

  async indexes(tenantId: string, collection: DataCollection): Promise<IndexInfo[]> {
    const records = await this.records(tenantId, collection.name);
    const missingIsEmpty = ignoring(MONGO_ERROR.namespaceNotFound);
    const [existing = [], usage = [], storage = []] = await Promise.all([
      records.listIndexes().toArray().catch(missingIsEmpty),
      records.aggregate<{ name: string; accesses: { ops: number; since: Date } }>([{ $indexStats: {} }]).toArray().catch(missingIsEmpty),
      records.aggregate<{ storageStats: { indexSizes: Record<string, number> } }>([{ $collStats: { storageStats: {} } }]).toArray().catch(missingIsEmpty),
    ]);
    const sizes = storage[0]?.storageStats.indexSizes ?? {};
    const wanted = wantedIndexes(collection);
    const info = (index: IndexDescriptionInfo | undefined, want: WantedIndex | undefined, name: string): IndexInfo => {
      const used = usage.find((u) => u.name === name);
      const options: Document = index ?? want?.options ?? {};
      return {
        name,
        origin: originOf(name, want),
        keys: want ? wantedKeys(want) : keysOf(index!),
        unique: !!options.unique,
        sparse: !!options.sparse,
        partialFilter: (options.partialFilterExpression as Record<string, unknown>) ?? null,
        expireAfterSeconds: (options.expireAfterSeconds as number) ?? null,
        status: index ? 'ready' : 'missing',
        sizeBytes: sizes[name] ?? null,
        uses: used ? Number(used.accesses.ops) : null,
        usedSince: used ? new Date(used.accesses.since).toISOString() : null,
      };
    };
    const byName = new Map(existing.map((index) => [String(index.name), index]));
    return [
      ...(byName.has('_id_') ? [info(byName.get('_id_'), undefined, '_id_')] : []),
      ...wanted.map((want) => info(byName.get(want.name), want, want.name)),
      ...existing.filter((index) => index.name !== '_id_' && !wanted.some((w) => w.name === index.name)).map((index) => info(index, undefined, String(index.name))),
    ];
  }

  async stats(tenantId: string, collection: string): Promise<CollectionStats> {
    const records = await this.records(tenantId, collection);
    const [row] =
      (await records
        .aggregate<{ storageStats: Document }>([{ $collStats: { storageStats: {} } }])
        .toArray()
        .catch(ignoring(MONGO_ERROR.namespaceNotFound))) ?? [];
    const s = row?.storageStats ?? {};
    return {
      storedAs: physicalName(collection),
      records: Number(s.count ?? 0),
      dataSizeBytes: Number(s.size ?? 0),
      storageSizeBytes: Number(s.storageSize ?? 0),
      avgRecordBytes: Number(s.avgObjSize ?? 0),
      indexes: Number(s.nindexes ?? 0),
      indexSizeBytes: Number(s.totalIndexSize ?? 0),
    };
  }

  /** Runs a write; a duplicate unique value becomes a DuplicateValueError (409), a schema refusal a 422. */
  private async write<T>(collection: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      const duplicate = duplicateOf(error);
      if (duplicate) throw new DuplicateValueError(collection, duplicate.field, duplicate.value);
      if (mongoCode(error) === MONGO_ERROR.documentValidationFailure) {
        throw new ValidationFailedError([{ message: `The database refused the record in “${collection}”: ${describeRefusal(error)}` }]);
      }
      return this.refused(collection, error);
    }
  }

  /** Runs a read (or a filtered delete); errors a user can fix — a missing text index, a bad pipeline — become 422s. */
  private async read<T>(collection: string, run: () => Promise<T>, what: 'query' | 'pipeline' = 'query'): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return this.refused(collection, error, what);
    }
  }

  private refused(collection: string, error: unknown, what: 'query' | 'pipeline' = 'query'): never {
    const code = mongoCode(error);
    const message = (error as Error).message ?? '';
    if (code === MONGO_ERROR.indexNotFound && /text index/i.test(message)) {
      throw new ValidationFailedError([{ message: `Text search needs a text index on “${collection}” — add one on the Data page → Indexes` }]);
    }
    if (code === MONGO_ERROR.maxTimeExpired) throw new ValidationFailedError([{ message: `The ${what} on “${collection}” took too long and was stopped` }]);
    if (what === 'pipeline' && typeof code === 'number' && code !== MONGO_ERROR.illegalOperation) {
      throw new ValidationFailedError([{ message: `MongoDB refused the pipeline: ${message}` }]);
    }
    throw error;
  }
}

