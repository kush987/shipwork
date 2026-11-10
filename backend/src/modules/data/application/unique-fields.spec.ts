import { inMemoryDataService } from '../../../testing/data-fakes';
import { InvalidOperationError, ValidationFailedError } from '../../../shared/domain/errors';
import { DuplicateValueError, UniqueConflictError } from '../domain/data-collection.errors';
import { normalizeFieldSpecs } from '../../../shared/schema/field-schema';

const PRODUCTS = {
  name: 'products',
  fields: [
    { key: 'name', type: 'string' as const, required: true },
    { key: 'sku', type: 'string' as const, required: true, unique: true },
    { key: 'price', type: 'number' as const, required: true },
  ],
};

describe('unique fields', () => {
  it('refuses a second record with the same value, on create and on update (409)', async () => {
    const { service } = inMemoryDataService();
    const created = await service.createCollection('t', PRODUCTS);
    expect(created.fields[1]).toEqual({ key: 'sku', type: 'string', required: true, unique: true });

    const shirt = await service.createRecord('t', 'products', { name: 'Shirt', sku: 'SHIRT-1', price: 200 });
    const cap = await service.createRecord('t', 'products', { name: 'Cap', sku: 'CAP-1', price: 50 });
    const duplicate = await service.createRecord('t', 'products', { name: 'Other shirt', sku: 'SHIRT-1', price: 1 }).catch((e) => e);
    expect(duplicate).toBeInstanceOf(DuplicateValueError);
    expect(duplicate).toBeInstanceOf(InvalidOperationError);
    expect(duplicate.message).toBe('A record in “products” already has sku “SHIRT-1”');

    await expect(service.updateRecord('t', 'products', cap.id, { sku: 'SHIRT-1' })).rejects.toThrow('already has sku “SHIRT-1”');
    // Updating a record without changing its value is fine, and other workspaces are separate.
    await service.updateRecord('t', 'products', shirt.id, { price: 250 });
    await service.createCollection('other', PRODUCTS);
    await service.createRecord('other', 'products', { name: 'Shirt', sku: 'SHIRT-1', price: 200 });
  });

  it("can't be turned on while records share a value; nothing changes then", async () => {
    const { service } = inMemoryDataService();
    await service.createCollection('t', { ...PRODUCTS, fields: PRODUCTS.fields.map(({ unique: _u, ...f }) => f) });
    await service.createRecord('t', 'products', { name: 'A', sku: 'X-1', price: 1 });
    await service.createRecord('t', 'products', { name: 'B', sku: 'X-1', price: 2 });
    const error = await service.updateCollection('t', 'products', { fields: PRODUCTS.fields }).catch((e) => e);
    expect(error).toBeInstanceOf(UniqueConflictError);
    expect(error.message).toBe('Can\'t make “sku” unique: 2 records in “products” have sku “X-1” — change or delete them first');
    expect((await service.getCollection('t', 'products')).fields.some((f) => f.unique)).toBe(false);
    await service.createRecord('t', 'products', { name: 'C', sku: 'X-1', price: 3 });
  });

  it('only text and number fields; request schemas never keep it', async () => {
    const { service } = inMemoryDataService();
    const bad = await service
      .createCollection('t', { name: 'flags', fields: [{ key: 'on', type: 'boolean', required: false, unique: true }] })
      .catch((e: ValidationFailedError) => e.issues.map((i) => i.message));
    expect(bad).toEqual(['Field "on": only text, number and date fields can be unique']);
    expect(normalizeFieldSpecs([{ key: 'sku', type: 'string', required: true, unique: true }])).toEqual([{ key: 'sku', type: 'string', required: true }]);
  });
});
