import type { IndexDescriptionInfo } from 'mongodb';
import { parseFilter, parseSort } from '../../../shared/query/record-query';
import { toMongoFilter, toMongoSort } from '../../../shared/query/mongo-record-query';
import { runInMemory } from '../../../shared/query/record-query.evaluator';
import { describeRefusal, duplicateOf, keysOf, NATIVE_MAPPING, projectionOf, sameIndex, toMongoUpdate, toValidator, wantedIndexes, withPipelineDates } from './mongo-collection-design';
import { fromLegacyRecord, toRecord } from './data.mapper';
import { parseUpdate } from '../domain/record-update';

describe('records stored as plain documents', () => {
  it('filters on the fields themselves (no data. prefix), escaping $contains and reading dates', () => {
    const filter = toMongoFilter(
      parseFilter({ id: 'rec_1', price: { $gte: 1, $lte: 9 }, name: { $contains: 'a.b' }, 'customer.phone': '98', createdAt: { $gte: '2026-01-01T00:00:00Z' } }),
      NATIVE_MAPPING,
    );
    expect(filter).toEqual({
      _id: { $eq: 'rec_1' },
      price: { $gte: 1, $lte: 9 },
      name: { $regex: 'a\\.b', $options: 'i' },
      'customer.phone': { $eq: '98' },
      createdAt: { $gte: new Date('2026-01-01T00:00:00Z') },
    });
  });

  it('sorts with a stable tiebreaker', () => {
    expect(toMongoSort(parseSort(undefined), NATIVE_MAPPING)).toEqual({ createdAt: -1, _id: -1 });
  });

  it('keeps both conditions when one field gets the same operator twice (a filter plus a page cursor)', () => {
    const conditions = [...parseFilter({ price: { $lt: 100 } }), { field: 'price', op: '$lt' as const, value: 50 }, { field: 'price', op: '$gt' as const, value: 1 }];
    expect(toMongoFilter(conditions, NATIVE_MAPPING)).toEqual({ price: { $lt: 100, $gt: 1 }, $and: [{ price: { $lt: 50 } }] });
  });

  it('maps documents to records, old-layout records to documents, and changes to $set / $unset', () => {
    const at = new Date('2026-11-09T00:00:00Z');
    expect(toRecord({ _id: 'rec_1', sku: 'A', createdAt: at, updatedAt: at })).toEqual({ id: 'rec_1', sku: 'A', createdAt: at.toISOString(), updatedAt: at.toISOString() });
    expect(fromLegacyRecord({ _id: 'rec_1', tenantId: 't', collectionName: 'products', data: { sku: 'A' }, createdAt: at, updatedAt: at })).toEqual({
      _id: 'rec_1',
      sku: 'A',
      createdAt: at,
      updatedAt: at,
    });
    expect(toRecord({ _id: 'rec_2', paidAt: at, __score: 1.5, createdAt: at, updatedAt: at })).toEqual({
      id: 'rec_2',
      paidAt: at.toISOString(),
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    });
  });

  it('asks only for the wanted fields (id and timestamps always), plus the search score', () => {
    expect(projectionOf(undefined, false)).toBeUndefined();
    expect(projectionOf(['name', 'id'], false)).toEqual({ name: 1, _id: 1, createdAt: 1, updatedAt: 1 });
    expect(projectionOf(undefined, true)).toEqual({ __score: { $meta: 'textScore' } });
  });
});

describe('changes as MongoDB updates', () => {
  const fields = [
    { key: 'stock', type: 'number' as const, required: true },
    { key: 'tags', type: 'array' as const, required: false },
    { key: 'paidAt', type: 'date' as const, required: false },
  ];
  const now = new Date('2026-11-09T10:00:00Z');

  it('turns every operator into its MongoDB form, dates into Dates, and an upsert into $setOnInsert', () => {
    const { change, issues } = parseUpdate(
      {
        $set: { paidAt: '2026-11-09', note: 'x' },
        $unset: ['old'],
        $inc: { stock: -1 },
        $push: { tags: { $each: ['a', 'b'], $slice: -5 } },
        $addToSet: { labels: 'vip' },
        $pull: { flags: { $in: ['x'] } },
        $max: { best: 3 },
        $currentDate: { seenAt: true },
        $setOnInsert: { source: 'api' },
      },
      fields,
    );
    expect(issues).toEqual([]);
    expect(toMongoUpdate(change, ['createdAt', 'updatedAt', 'paidAt'], now, { id: 'rec_9' })).toEqual({
      $set: { paidAt: new Date('2026-11-09T00:00:00.000Z'), note: 'x', updatedAt: now },
      $unset: { old: '' },
      $inc: { stock: -1 },
      $max: { best: 3 },
      $push: { tags: { $each: ['a', 'b'], $slice: -5 } },
      $addToSet: { labels: { $each: ['vip'] } },
      $pull: { flags: { $in: ['x'] } },
      $currentDate: { seenAt: true },
      $setOnInsert: { source: 'api', _id: 'rec_9', createdAt: now },
    });
  });

  it('reads dates in a pipeline’s $match stages, and the validator’s refusal in words', () => {
    expect(withPipelineDates([{ $match: { createdAt: { $gte: '2026-11-01' }, status: '2026-11-01' } }, { $group: { _id: null } }], ['createdAt'])).toEqual([
      { $match: { createdAt: { $gte: new Date('2026-11-01') }, status: '2026-11-01' } },
      { $group: { _id: null } },
    ]);
    const refusal = {
      errInfo: {
        details: {
          schemaRulesNotSatisfied: [
            { operatorName: 'required', missingProperties: ['weight'] },
            { operatorName: 'properties', propertiesNotSatisfied: [{ propertyName: 'awb' }] },
          ],
        },
      },
    };
    expect(describeRefusal(refusal)).toBe('weight is required; awb has the wrong type');
  });
});

describe('the MongoDB validator', () => {
  it('requires the system fields and the required ones, and checks every declared type', () => {
    const validator = toValidator([
      { key: 'sku', type: 'string', required: true },
      { key: 'price', type: 'number', required: false },
      { key: 'active', type: 'boolean', required: false },
      { key: 'meta', type: 'object', required: false },
      { key: 'tags', type: 'array', required: true },
    ]);
    expect(validator.$jsonSchema.required).toEqual(['_id', 'createdAt', 'updatedAt', 'sku', 'tags']);
    expect(validator.$jsonSchema.properties).toEqual({
      _id: { bsonType: 'string' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      sku: { bsonType: 'string' },
      price: { bsonType: 'number' },
      active: { bsonType: 'bool' },
      meta: { bsonType: 'object' },
      tags: { bsonType: 'array' },
    });
  });
});

describe('the indexes a collection gets', () => {
  const collection = {
    fields: [{ key: 'sku', type: 'string' as const, required: true, unique: true }],
    indexes: [
      { name: 'by_seller', keys: [{ field: 'sellerId', order: 1 as const }, { field: 'createdAt', order: -1 as const }] },
      { name: 'search', keys: [{ field: 'title', order: 'text' as const }] },
      { name: 'expire', keys: [{ field: 'createdAt', order: 1 as const }], expireAfterSeconds: 60 },
      { name: 'open_orders', keys: [{ field: 'orderId', order: 1 as const }], unique: true, partialFilter: { status: 'open' } },
    ],
  };

  it('the built-in order index, one per unique field (partial on the field), then the custom ones', () => {
    expect(wantedIndexes(collection)).toEqual([
      { name: 'created_at', origin: 'built-in', key: { createdAt: -1, _id: -1 }, options: {} },
      { name: 'unique_sku', origin: 'unique-field', key: { sku: 1 }, options: { unique: true, partialFilterExpression: { sku: { $exists: true } } } },
      { name: 'by_seller', origin: 'custom', key: { sellerId: 1, createdAt: -1 }, options: {} },
      { name: 'search', origin: 'custom', key: { title: 'text' }, options: {} },
      { name: 'expire', origin: 'custom', key: { createdAt: 1 }, options: { expireAfterSeconds: 60 } },
      { name: 'open_orders', origin: 'custom', key: { orderId: 1 }, options: { unique: true, partialFilterExpression: { status: { $eq: 'open' } } } },
    ]);
  });

  it('recognises the database’s version of each, and a changed one', () => {
    const [, unique, bySeller, search, expire] = wantedIndexes(collection);
    const asStored = (info: Partial<IndexDescriptionInfo>) => ({ v: 2, ...info }) as IndexDescriptionInfo;
    expect(sameIndex(asStored({ name: 'unique_sku', key: { sku: 1 }, unique: true, partialFilterExpression: { sku: { $exists: true } } }), unique)).toBe(true);
    expect(sameIndex(asStored({ name: 'unique_sku', key: { sku: 1 }, unique: true }), unique)).toBe(false);
    expect(sameIndex(asStored({ name: 'by_seller', key: { sellerId: 1, createdAt: -1 } }), bySeller)).toBe(true);
    expect(sameIndex(asStored({ name: 'by_seller', key: { createdAt: -1, sellerId: 1 } }), bySeller)).toBe(false);
    expect(sameIndex(asStored({ name: 'search', key: { _fts: 'text', _ftsx: 1 }, weights: { title: 1 } }), search)).toBe(true);
    expect(sameIndex(asStored({ name: 'search', key: { _fts: 'text', _ftsx: 1 }, weights: { body: 1 } }), search)).toBe(false);
    expect(sameIndex(asStored({ name: 'expire', key: { createdAt: 1 }, expireAfterSeconds: 60 }), expire)).toBe(true);
    expect(sameIndex(asStored({ name: 'expire', key: { createdAt: 1 }, expireAfterSeconds: 30 }), expire)).toBe(false);
  });

  it('reads an index’s fields back, a text index’s from its weights', () => {
    expect(keysOf({ name: 'x', key: { _id: 1 } } as IndexDescriptionInfo)).toEqual([{ field: 'id', order: 1 }]);
    expect(keysOf({ name: 'x', key: { sellerId: 1, _fts: 'text', _ftsx: 1 }, weights: { title: 1, body: 1 } } as unknown as IndexDescriptionInfo)).toEqual([
      { field: 'sellerId', order: 1 },
      { field: 'title', order: 'text' },
      { field: 'body', order: 'text' },
    ]);
  });
});

describe('duplicate-key errors', () => {
  it('name the fields and values', () => {
    expect(duplicateOf({ code: 11000, keyValue: { sku: 'SHIRT-1' } })).toEqual({ field: 'sku', value: 'SHIRT-1' });
    expect(duplicateOf({ code: 11000, keyValue: { sellerId: 's1', orderId: 'o1' } })).toEqual({ field: 'sellerId + orderId', value: { sellerId: 's1', orderId: 'o1' } });
    expect(duplicateOf({ code: 11000 })).toEqual({ field: 'value', value: undefined });
    expect(duplicateOf(new Error('boom'))).toBeNull();
  });
});

describe('in-memory queries agree with Mongo', () => {
  const rows = [
    { id: 'a', rank: 2, name: 'b' },
    { id: 'b', rank: null, name: 'B' },
    { id: 'c', name: 'a' },
    { id: 'd', rank: 10, name: 'A' },
  ];
  const ids = (filter: unknown, sort?: unknown) => runInMemory(rows, { conditions: parseFilter(filter), sort: parseSort(sort ?? { id: 1 }), limit: 50, skip: 0 }).records.map((r) => r.id);

  it('matches null against missing fields too, and ranges only present values', () => {
    expect(ids({ rank: null })).toEqual(['b', 'c']);
    expect(ids({ rank: { $ne: null } })).toEqual(['a', 'd']);
    expect(ids({ rank: { $lt: 5 } })).toEqual(['a']);
    expect(ids({ rank: { $lte: null } })).toEqual(['b', 'c']);
  });

  it('orders missing and null first, numbers numerically and text by code unit', () => {
    expect(ids({}, { rank: 1, id: 1 })).toEqual(['b', 'c', 'a', 'd']);
    expect(ids({}, { name: 1 })).toEqual(['d', 'b', 'c', 'a']);
    expect(ids({ name: { $gt: 'Z' } })).toEqual(['a', 'c']);
  });
});
