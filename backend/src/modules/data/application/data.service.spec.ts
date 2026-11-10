import { InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { inMemoryDataService } from '../../../testing/data-fakes';

describe('DataService', () => {
  const setup = async () => {
    const { service } = inMemoryDataService();
    await service.createCollection('t', {
      name: 'products',
      fields: [
        { key: 'name', type: 'string', required: true },
        { key: 'price', type: 'number', required: true },
      ],
    });
    return service;
  };

  it('validates collection names and refuses duplicates', async () => {
    const service = await setup();
    await expect(service.createCollection('t', { name: 'Bad Name' })).rejects.toBeInstanceOf(ValidationFailedError);
    await expect(service.createCollection('t', { name: 'x', fields: [{ key: 'id', type: 'string', required: false }] })).rejects.toThrow(ValidationFailedError);
    await expect(service.createCollection('t', { name: 'products' })).rejects.toBeInstanceOf(InvalidOperationError);
  });

  it('checks records against the schema and protects system fields', async () => {
    const service = await setup();
    await expect(service.createRecord('t', 'products', { name: 'Kurta', price: '12' })).rejects.toThrow(ValidationFailedError);
    await expect(service.createRecord('t', 'products', { name: 'Kurta' })).rejects.toThrow(ValidationFailedError);
    await expect(service.createRecord('t', 'products', { name: 'Kurta', price: 12, id: 'mine' })).rejects.toThrow(ValidationFailedError);
    await expect(service.createRecord('t', 'products', { name: 'Kurta', price: 12, $set: 1 })).rejects.toThrow(ValidationFailedError);
    await expect(service.createRecord('t', 'missing', {})).rejects.toBeInstanceOf(NotFoundError);

    const saved = await service.createRecord('t', 'products', { name: 'Kurta', price: 12, colour: 'red' });
    expect(saved).toMatchObject({ name: 'Kurta', price: 12, colour: 'red', id: expect.any(String), createdAt: expect.any(String) });
  });

  it('merges updates, removes fields set to null but never required ones', async () => {
    const service = await setup();
    const { id } = await service.createRecord('t', 'products', { name: 'Kurta', price: 12, colour: 'red' });
    expect(await service.updateRecord('t', 'products', id, { price: 15, colour: null })).toMatchObject({ name: 'Kurta', price: 15 });
    expect((await service.getRecord('t', 'products', id))!.colour).toBeUndefined();
    await expect(service.updateRecord('t', 'products', id, { name: null })).rejects.toThrow(ValidationFailedError);
    expect(await service.updateRecord('t', 'products', 'nope', { price: 1 })).toBeNull();
  });

  it('lists with filters and keeps tenants apart', async () => {
    const service = await setup();
    await service.createRecord('t', 'products', { name: 'A', price: 5 });
    await service.createRecord('t', 'products', { name: 'B', price: 50 });
    const cheap = await service.listRecords('t', 'products', { filter: { price: { $lt: 10 } } });
    expect(cheap.total).toBe(1);
    expect(cheap.records[0].name).toBe('A');
    await expect(service.listRecords('other', 'products', {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('seeds the sample collections once', async () => {
    const { service } = inMemoryDataService();
    expect((await service.seedSamples('t')).created).toEqual(['products', 'orders', 'app_users']);
    expect((await service.seedSamples('t')).created).toEqual([]);
    expect((await service.listRecords('t', 'products', {})).total).toBe(3);
    // Sample users keep a password hash, never the password.
    const [user] = await service.findRecords('t', 'app_users', { filter: { email: 'admin@example.com' } });
    expect(user).toMatchObject({ roles: ['admin'], passwordHash: expect.stringMatching(/^scrypt\$/) });
    expect(user).not.toHaveProperty('password');
  });
});
