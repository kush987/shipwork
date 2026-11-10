import { warehouseFixture } from '../../../testing/shipment-fakes';
import { InvalidOperationError } from '../../../shared/domain/errors';

describe('WarehouseService', () => {
  it('makes the first warehouse the default, and keeps exactly one default', async () => {
    const { service, delhi, mumbai } = await warehouseFixture();
    expect(delhi.isDefault).toBe(true);
    expect(mumbai.isDefault).toBe(false);
    await service.update('t', mumbai.id, { isDefault: true });
    const list = await service.list('t');
    expect(list.filter((w) => w.isDefault).map((w) => w.id)).toEqual([mumbai.id]);
  });

  it('refuses to deactivate or un-default the default warehouse', async () => {
    const { service, delhi } = await warehouseFixture();
    await expect(service.deactivate('t', delhi.id)).rejects.toBeInstanceOf(InvalidOperationError);
    await expect(service.update('t', delhi.id, { isDefault: false })).rejects.toBeInstanceOf(InvalidOperationError);
  });

  it('hides deactivated warehouses unless asked', async () => {
    const { service, mumbai } = await warehouseFixture();
    await service.deactivate('t', mumbai.id);
    expect((await service.list('t')).map((w) => w.name)).toEqual(['Delhi FC']);
    expect(await service.list('t', true)).toHaveLength(2);
    await expect(service.getActive('t', mumbai.id)).rejects.toThrow('deactivated');
  });
});
