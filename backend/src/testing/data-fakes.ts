import { DataService } from '../modules/data/application/data.service';
import { DataSourceService } from '../modules/data/application/data-source.service';
import type { SystemDataSource } from '../modules/data/domain/data-source.ports';
import { matchesAll, matchesCondition, runInMemory, sortRecords } from '../shared/query/record-query.evaluator';
import { CollectionStats, DataCollection, DataRecord, IndexInfo } from '../modules/data/domain/data-collection.types';
import { uniqueKeys } from '../modules/data/domain/data-collection';
import { wantedIndexes, wantedKeys, withoutNoise } from '../modules/data/infrastructure/mongo-collection-design';
import { DataCollectionRepository, DataRecordRepository } from '../modules/data/domain/data-collection.repository';
import type { RecordWrites, StoredCollection } from '../modules/data/domain/data-collection.repository';
import type { ManyResult, RecordChange, RecordTarget, UpdateOptions, UpdateResult } from '../modules/data/domain/record-update.types';
import { ValidationFailedError } from '../shared/domain/errors';
import type { FilterCondition, FilterOperator, RecordQuery } from '../shared/query/record-query.types';
import { countBy, get, isEqual, pick, set, uniqWith, unset } from 'lodash';
import { DuplicateValueError, UniqueConflictError } from '../modules/data/domain/data-collection.errors';

export class InMemoryCollections extends DataCollectionRepository {
  readonly items = new Map<string, DataCollection>();
  private key = (tenantId: string, name: string) => `${tenantId}:${name}`;
  async create(c: DataCollection) {
    this.items.set(this.key(c.tenantId, c.name), structuredClone(c));
  }
  /** Replaces the definition with the same id, like the database does (a rename changes the name). */
  async save(c: DataCollection) {
    for (const [key, item] of this.items) if (item.id === c.id) this.items.delete(key);
    this.items.set(this.key(c.tenantId, c.name), structuredClone(c));
  }
  async findByName(tenantId: string, name: string) {
    return structuredClone(this.items.get(this.key(tenantId, name)) ?? null);
  }
  async list(tenantId: string) {
    return [...this.items.values()].filter((c) => c.tenantId === tenantId);
  }
  async delete(tenantId: string, name: string) {
    this.items.delete(this.key(tenantId, name));
  }
  async count(tenantId: string) {
    return (await this.list(tenantId)).length;
  }
}

/** One rule records must keep: no two may share the values of `keys` (missing values skip it when `skipMissing`). */
type UniqueRule = { name: string; keys: string[]; skipMissing: boolean };

type Row = DataRecord & { _tenant: string; _collection: string };

/**
 * Record storage in memory, with the semantics of the MongoDB adapter: unique rules, update
 * operators, onlyIf / upsert outcomes, and transactions that leave nothing behind when they throw.
 */
export class InMemoryRecords extends DataRecordRepository {
  rows: Row[] = [];
  /** Unique rules per `tenant:collection`, enforced like the database's unique indexes. */
  readonly unique = new Map<string, UniqueRule[]>();
  /** The definition each collection was last prepared for. */
  readonly prepared = new Map<string, DataCollection>();
  private seq = 0;

  private slot = (tenantId: string, collection: string) => `${tenantId}:${collection}`;
  private scope(tenantId: string, collection: string) {
    return this.rows.filter((r) => r._tenant === tenantId && r._collection === collection);
  }
  private view({ _tenant, _collection, ...record }: Row, fields?: string[]): DataRecord {
    const copy = structuredClone(record) as DataRecord;
    return fields?.length ? (pick(copy, [...fields, 'id', 'createdAt', 'updatedAt']) as DataRecord) : copy;
  }
  private now() {
    return new Date(Date.now() + ++this.seq).toISOString();
  }
  async insert(tenantId: string, collection: StoredCollection, data: Record<string, unknown>) {
    this.assertUnique(tenantId, collection.name, data);
    const now = this.now();
    const row = { ...structuredClone(data), id: `rec_${this.seq}`, createdAt: now, updatedAt: now, _tenant: tenantId, _collection: collection.name };
    this.rows.push(row);
    return this.view(row);
  }
  async find(tenantId: string, collection: StoredCollection, query: RecordQuery) {
    return runInMemory(this.scope(tenantId, collection.name), query).records.map((r) => this.view(r, query.fields));
  }
  async count(tenantId: string, collection: StoredCollection, query: Pick<RecordQuery, 'conditions'>) {
    return this.scope(tenantId, collection.name).filter((r) => matchesAll(r, query.conditions)).length;
  }
  async get(tenantId: string, collection: StoredCollection, id: string, fields?: string[]) {
    const row = this.scope(tenantId, collection.name).find((r) => r.id === id);
    return row ? this.view(row, fields) : null;
  }
  async update(tenantId: string, collection: StoredCollection, target: RecordTarget, change: RecordChange, options: UpdateOptions = {}): Promise<UpdateResult> {
    const rows = this.scope(tenantId, collection.name);
    const matches = (r: Row) => ('id' in target ? r.id === target.id : isEqual(valueAt(r, target.field), target.value));
    const candidates = sortRecords(rows.filter(matches), [{ field: 'createdAt', direction: -1 }]);
    const row = candidates.find((r) => matchesAll(r, options.onlyIf ?? []));
    if (row) {
      const next = applyChange(structuredClone(row), change, this.now());
      this.assertUnique(tenantId, collection.name, next, row.id);
      Object.assign(row, next);
      for (const key of Object.keys(row)) if (!(key in next)) delete (row as Record<string, unknown>)[key];
      return { outcome: 'updated', record: this.view(row) };
    }
    if (candidates.length) return { outcome: 'unmet', record: null };
    if (!options.upsert || 'id' in target) return { outcome: 'not_found', record: null };
    const created = applyChange({ [target.field]: target.value, ...structuredClone(change.setOnInsert) } as Record<string, unknown>, change, this.now());
    const missing = collection.fields.filter((f) => f.required && created[f.key] === undefined).map((f) => `${f.key} is required`);
    if (missing.length) throw new ValidationFailedError([{ message: `The database refused the record in “${collection.name}”: ${missing.join('; ')}` }]);
    delete created.updatedAt;
    const record = await this.insert(tenantId, collection, created);
    return { outcome: 'created', record };
  }
  async updateMany(tenantId: string, collection: StoredCollection, conditions: FilterCondition[], change: RecordChange): Promise<ManyResult> {
    const rows = this.scope(tenantId, collection.name).filter((r) => matchesAll(r, conditions));
    for (const row of rows) {
      const next = applyChange(structuredClone(row), change, this.now());
      this.assertUnique(tenantId, collection.name, next, row.id);
      Object.assign(row, next);
      for (const key of Object.keys(row)) if (!(key in next)) delete (row as Record<string, unknown>)[key];
    }
    return { matched: rows.length, modified: rows.length };
  }
  async delete(tenantId: string, collection: StoredCollection, id: string) {
    const index = this.rows.findIndex((r) => r._tenant === tenantId && r._collection === collection.name && r.id === id);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
  async deleteMany(tenantId: string, collection: StoredCollection, conditions: FilterCondition[]) {
    const doomed = new Set(this.scope(tenantId, collection.name).filter((r) => matchesAll(r, conditions)));
    this.rows = this.rows.filter((r) => !doomed.has(r));
    return doomed.size;
  }
  async distinct(tenantId: string, collection: StoredCollection, field: string, conditions: FilterCondition[], limit: number) {
    const values = this.scope(tenantId, collection.name)
      .filter((r) => matchesAll(r, conditions))
      .flatMap((r) => [valueAt(r, field)].flat())
      .filter((v) => v !== undefined);
    return uniqWith(values, isEqual).slice(0, limit);
  }
  async aggregate(): Promise<{ results: Record<string, unknown>[]; truncated: boolean }> {
    throw new Error('Aggregation runs in MongoDB only (not in the in-memory fake)');
  }
  /** Runs `work`; if it throws, every record is put back as it was. */
  async transaction<T>(_tenantId: string, work: (writes: RecordWrites) => Promise<T>): Promise<T> {
    const before = structuredClone(this.rows);
    try {
      return await work(this);
    } catch (error) {
      this.rows = before;
      throw error;
    }
  }
  async counts(tenantId: string, collections: string[]) {
    const all = countBy(this.rows.filter((row) => row._tenant === tenantId), '_collection');
    return Object.fromEntries(collections.map((name) => [name, all[name] ?? 0]));
  }
  async prepare(tenantId: string, collection: DataCollection) {
    const rules: UniqueRule[] = [
      ...uniqueKeys(collection).map((key) => ({ name: `unique_${key}`, keys: [key], skipMissing: true })),
      ...collection.indexes.filter((i) => i.unique).map((i) => ({ name: i.name, keys: i.keys.map((k) => k.field), skipMissing: !!i.sparse || !!i.partialFilter })),
    ];
    for (const rule of rules) {
      const rows = this.scope(tenantId, collection.name).filter((r) => !rule.skipMissing || rule.keys.every((k) => valueAt(r, k) !== undefined));
      const counts = countBy(rows, (r) => JSON.stringify(rule.keys.map((k) => valueAt(r, k) ?? null)));
      const shared = Object.entries(counts).find(([, n]) => n > 1);
      if (shared) {
        const values = JSON.parse(shared[0]) as unknown[];
        throw new UniqueConflictError(collection.name, rule.keys.join(' + '), values.length === 1 ? values[0] : values, shared[1]);
      }
    }
    this.unique.set(this.slot(tenantId, collection.name), rules);
    this.prepared.set(this.slot(tenantId, collection.name), structuredClone(collection));
  }
  async dropIndex() {}
  async drop(tenantId: string, collection: string) {
    this.rows = this.rows.filter((r) => !(r._tenant === tenantId && r._collection === collection));
    this.unique.delete(this.slot(tenantId, collection));
    this.prepared.delete(this.slot(tenantId, collection));
  }
  async rename(tenantId: string, from: string, to: string) {
    for (const row of this.scope(tenantId, from)) row._collection = to;
    for (const map of [this.unique, this.prepared] as Map<string, unknown>[]) {
      if (map.has(this.slot(tenantId, from))) map.set(this.slot(tenantId, to), map.get(this.slot(tenantId, from)));
      map.delete(this.slot(tenantId, from));
    }
  }
  async indexes(_tenantId: string, collection: DataCollection): Promise<IndexInfo[]> {
    return wantedIndexes(collection).map((w) => ({
      name: w.name,
      origin: w.origin,
      keys: wantedKeys(w),
      unique: !!w.options.unique,
      sparse: !!w.options.sparse,
      partialFilter: (w.options.partialFilterExpression as Record<string, unknown>) ?? null,
      expireAfterSeconds: w.options.expireAfterSeconds ?? null,
      status: 'ready',
      sizeBytes: null,
      uses: null,
      usedSince: null,
    }));
  }
  async stats(tenantId: string, collection: string): Promise<CollectionStats> {
    const records = this.scope(tenantId, collection).length;
    return { storedAs: `data.${collection}`, records, dataSizeBytes: 0, storageSizeBytes: 0, avgRecordBytes: 0, indexes: 0, indexSizeBytes: 0 };
  }
  private assertUnique(tenantId: string, collection: string, data: Record<string, unknown>, selfId?: string) {
    for (const rule of this.unique.get(this.slot(tenantId, collection)) ?? []) {
      if (rule.skipMissing && rule.keys.some((k) => valueAt(data, k) === undefined)) continue;
      const mine = rule.keys.map((k) => valueAt(data, k) ?? null);
      const taken = this.scope(tenantId, collection).some((r) => r.id !== selfId && isEqual(rule.keys.map((k) => valueAt(r, k) ?? null), mine));
      if (taken) throw new DuplicateValueError(collection, rule.keys.join(' + '), mine.length === 1 ? mine[0] : mine);
    }
  }
}

/** A change applied to a record in memory, as MongoDB applies it. */
function applyChange(record: Record<string, unknown>, change: RecordChange, now: string): Record<string, unknown> {
  for (const [path, value] of Object.entries(change.set)) set(record, path, structuredClone(value));
  for (const path of change.unset) unset(record, path);
  // As the adapter does: results of $inc / $mul without binary floating-point noise.
  for (const [path, by] of Object.entries(change.inc)) set(record, path, withoutNoise((Number(get(record, path)) || 0) + by));
  for (const [path, by] of Object.entries(change.mul)) set(record, path, withoutNoise((Number(get(record, path)) || 0) * by));
  for (const [path, value] of Object.entries(change.min)) if (get(record, path) === undefined || compareValues(value, get(record, path)) < 0) set(record, path, value);
  for (const [path, value] of Object.entries(change.max)) if (get(record, path) === undefined || compareValues(value, get(record, path)) > 0) set(record, path, value);
  for (const [path, push] of Object.entries(change.push)) {
    const list = [...((get(record, path) as unknown[]) ?? [])];
    list.splice(push.position ?? list.length, 0, ...structuredClone(push.each));
    set(record, path, push.slice === undefined ? list : push.slice < 0 ? list.slice(push.slice) : list.slice(0, push.slice));
  }
  for (const [path, each] of Object.entries(change.addToSet)) set(record, path, uniqWith([...((get(record, path) as unknown[]) ?? []), ...each], isEqual));
  for (const [path, value] of Object.entries(change.pull)) {
    const list = (get(record, path) as unknown[]) ?? [];
    const operators = value && typeof value === 'object' && Object.keys(value).every((k) => k.startsWith('$'));
    const removes = (item: unknown) =>
      operators ? Object.entries(value as Record<string, unknown>).every(([op, v]) => matchesCondition({ item }, { field: 'item', op: op as FilterOperator, value: v })) : isEqual(item, value);
    set(record, path, list.filter((item) => !removes(item)));
  }
  for (const path of change.currentDate) set(record, path, now);
  record.updatedAt = now;
  return record;
}

const compareValues = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

/** A field or nested path's value (`customer.phone`). */
const valueAt = (record: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), record);

export const inMemoryDataService = (systemSources: SystemDataSource[] = []) => {
  const collections = new InMemoryCollections();
  const records = new InMemoryRecords();
  const service = new DataService(collections, records);
  return { service, sources: new DataSourceService(service, systemSources), collections, records };
};
