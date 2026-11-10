import { inMemoryDataService } from '../../../testing/data-fakes';
import { InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { DuplicateValueError, UniqueConflictError } from '../domain/data-collection.errors';
import type { IndexSpec } from '../domain/data-collection.types';

const ORDERS = {
  name: 'orders',
  fields: [
    { key: 'orderId', type: 'string' as const, required: true, unique: true },
    { key: 'sellerId', type: 'string' as const, required: true },
    { key: 'status', type: 'string' as const, required: true },
  ],
};

const messages = (error: unknown) => (error as ValidationFailedError).issues.map((i) => i.message);

describe('collection indexes', () => {
  it('lists the built-in index, unique fields and custom indexes; adds and drops custom ones', async () => {
    const { service, records } = inMemoryDataService();
    await service.createCollection('t', ORDERS);
    const listed = await service.addIndex('t', 'orders', { name: 'by_seller', keys: [{ field: 'sellerId', order: 1 }, { field: 'createdAt', order: -1 }] });
    expect(listed.map((i) => [i.name, i.origin])).toEqual([
      ['created_at', 'built-in'],
      ['unique_orderId', 'unique-field'],
      ['by_seller', 'custom'],
    ]);
    expect((await service.getCollection('t', 'orders')).indexes).toEqual([{ name: 'by_seller', keys: [{ field: 'sellerId', order: 1 }, { field: 'createdAt', order: -1 }] }]);
    expect(records.prepared.get('t:orders')?.indexes).toHaveLength(1);

    await expect(service.addIndex('t', 'orders', { name: 'by_seller', keys: [{ field: 'status', order: 1 }] })).rejects.toThrow('already has an index named “by_seller”');
    await service.dropIndex('t', 'orders', 'by_seller');
    expect((await service.getCollection('t', 'orders')).indexes).toEqual([]);
    await expect(service.dropIndex('t', 'orders', 'unique_orderId')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('enforces a unique compound index, and refuses one while records share the values (nothing changes)', async () => {
    const { service } = inMemoryDataService();
    await service.createCollection('t', ORDERS);
    await service.createRecord('t', 'orders', { orderId: 'o1', sellerId: 's1', status: 'open' });
    await service.createRecord('t', 'orders', { orderId: 'o2', sellerId: 's1', status: 'open' });
    const pair: IndexSpec = { name: 'seller_status', keys: [{ field: 'sellerId', order: 1 }, { field: 'status', order: 1 }], unique: true };
    const refused = await service.addIndex('t', 'orders', pair).catch((e) => e);
    expect(refused).toBeInstanceOf(UniqueConflictError);
    expect(refused.message).toContain('sellerId + status');
    expect((await service.getCollection('t', 'orders')).indexes).toEqual([]);

    await service.updateRecord('t', 'orders', (await service.findRecords('t', 'orders', { filter: { orderId: 'o2' } }))[0].id, { status: 'shipped' });
    await service.addIndex('t', 'orders', pair);
    const duplicate = await service.createRecord('t', 'orders', { orderId: 'o3', sellerId: 's1', status: 'open' }).catch((e) => e);
    expect(duplicate).toBeInstanceOf(DuplicateValueError);
    expect(duplicate.message).toContain('sellerId + status');
  });

  it('checks what MongoDB would refuse, with one message per problem', async () => {
    const { service } = inMemoryDataService();
    await service.createCollection('t', ORDERS);
    const add = (index: Partial<IndexSpec>) => service.addIndex('t', 'orders', { name: 'x', keys: [{ field: 'status', order: 1 }], ...index } as IndexSpec).catch(messages);

    expect(await add({ name: 'Bad name' })).toEqual(['Index name “Bad name” must be 1–48 characters: a lowercase letter, then lowercase letters, digits or _']);
    expect(await add({ name: 'unique_x' })).toEqual(['Index “unique_x”: this name is reserved']);
    expect(await add({ keys: [] })).toEqual(['Index “x”: give 1–8 fields']);
    expect(await add({ keys: [{ field: 'id', order: 1 }] })).toEqual(['Index “x”: “id” is not a field it can index']);
    expect(await add({ keys: [{ field: 'title', order: 'text' }], unique: true })).toEqual(['Index “x”: a text index can’t be unique']);
    expect(await add({ keys: [{ field: 'status', order: 1 }], expireAfterSeconds: 60 })).toEqual(['Index “x”: a TTL index has one key, a date field: createdAt, updatedAt']);
    expect(await add({ keys: [{ field: 'createdAt', order: 1 }], expireAfterSeconds: -1 })).toEqual(['Index “x”: expireAfterSeconds must be a whole number of seconds, 0 or more']);
    expect(await add({ sparse: true, partialFilter: { status: 'open' } })).toEqual(['Index “x”: use sparse or a partial filter, not both']);
    expect(await add({ partialFilter: { status: { $ne: 'open' } } })).toEqual(['Index “x”: a partial filter can use $eq $gt $gte $lt $lte $in $exists, not $ne']);
    expect(await add({ keys: [{ field: 'orderId', order: 1 }] })).toEqual(['Index “x”: it has the same fields as the unique field orderId']);

    await service.addIndex('t', 'orders', { name: 'search', keys: [{ field: 'status', order: 'text' }] });
    expect(await add({ name: 'search2', keys: [{ field: 'sellerId', order: 'text' }] })).toEqual(['A collection can have only one text index']);
  });

  it('replaces the custom indexes when a definition update gives them', async () => {
    const { service } = inMemoryDataService();
    await service.createCollection('t', { ...ORDERS, indexes: [{ name: 'by_status', keys: [{ field: 'status', order: 1 }] }] });
    expect((await service.getCollection('t', 'orders')).indexes.map((i) => i.name)).toEqual(['by_status']);
    await service.updateCollection('t', 'orders', { indexes: [{ name: 'expire', keys: [{ field: 'createdAt', order: 1 }], expireAfterSeconds: 3600 }] });
    expect((await service.getCollection('t', 'orders')).indexes).toEqual([{ name: 'expire', keys: [{ field: 'createdAt', order: 1 }], expireAfterSeconds: 3600 }]);
    // Leaving indexes out keeps them.
    await service.updateCollection('t', 'orders', { label: 'Orders' });
    expect((await service.getCollection('t', 'orders')).indexes).toHaveLength(1);
  });
});

describe('collections', () => {
  it('rename: records and indexes move with it; the name must be new and valid', async () => {
    const { service } = inMemoryDataService();
    await service.createCollection('t', ORDERS);
    await service.createCollection('t', { name: 'archive' });
    await service.createRecord('t', 'orders', { orderId: 'o1', sellerId: 's1', status: 'open' });

    await expect(service.renameCollection('t', 'orders', 'Archive!')).rejects.toBeInstanceOf(ValidationFailedError);
    await expect(service.renameCollection('t', 'orders', 'archive')).rejects.toBeInstanceOf(InvalidOperationError);
    const renamed = await service.renameCollection('t', 'orders', 'sales');
    expect(renamed.name).toBe('sales');
    expect(await service.collectionExists('t', 'orders')).toBe(false);
    expect((await service.listRecords('t', 'sales', {})).total).toBe(1);
    // The unique field still holds under the new name.
    await expect(service.createRecord('t', 'sales', { orderId: 'o1', sellerId: 's2', status: 'open' })).rejects.toBeInstanceOf(DuplicateValueError);
  });

  it('_id is the database’s: records can’t write it and collections can’t declare it', async () => {
    const { service } = inMemoryDataService();
    await service.createCollection('t', ORDERS);
    await expect(service.createRecord('t', 'orders', { _id: 'x', orderId: 'o1', sellerId: 's', status: 'open' })).rejects.toThrow('_id is set by the data store');
    await expect(service.createCollection('t', { name: 'bad', fields: [{ key: '_id', type: 'string', required: false }] })).rejects.toThrow('“_id” is a system field');
  });

  it('counts records per collection and deletes a collection with its records', async () => {
    const { service } = inMemoryDataService();
    await service.createCollection('t', ORDERS);
    await service.createRecord('t', 'orders', { orderId: 'o1', sellerId: 's1', status: 'open' });
    expect((await service.listCollections('t')).map((c) => [c.name, c.recordCount])).toEqual([['orders', 1]]);
    expect((await service.collectionStats('t', 'orders')).storedAs).toBe('data.orders');
    await service.deleteCollection('t', 'orders');
    await service.createCollection('t', ORDERS);
    expect((await service.listRecords('t', 'orders', {})).total).toBe(0);
  });
});
