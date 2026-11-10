import { inMemoryDataService } from '../../../testing/data-fakes';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../testing/shipment-fakes';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { ShipmentsDataSource } from '../../shipment/application/shipments.data-source';
import { WarehousesDataSource } from '../../warehouse/application/warehouses.data-source';
import { CouriersDataSource } from '../../courier/infrastructure/couriers.data-source';
import { CourierRegistry } from '../../courier/application/courier-registry';
import { SimulatedCourierProvider } from '../../courier/infrastructure/providers/simulated-courier.provider';
import { COURIER_PROFILES } from '../../courier/infrastructure/providers/courier-profiles.constants';
import { ValidationFailedError } from '../../../shared/domain/errors';

describe('DataSourceService', () => {
  const setup = async () => {
    const { service: warehouses, repo: warehouseRepo, delhi, mumbai } = await warehouseFixture();
    const repo = new InMemoryShipments();
    const shipments = new ShipmentService(repo, new RecordingPublisher(), warehouses);
    await shipments.create('t', shipmentInput(delhi.id, { orderId: 'ORD-1', orderValue: 900 }));
    await shipments.create('t', shipmentInput(mumbai.id, { orderId: 'ORD-2', orderValue: 4500, items: [{ name: 'Mug', sku: 'MUG-9', quantity: 2, unitPrice: 50 }] }));
    const registry = new CourierRegistry(COURIER_PROFILES.map((p) => new SimulatedCourierProvider(structuredClone(p))));
    const data = inMemoryDataService([new ShipmentsDataSource(repo), new WarehousesDataSource(warehouseRepo), new CouriersDataSource(registry)]);
    await data.service.seedSamples('t');
    return { ...data, delhi };
  };

  it('lists the tenant collections first, then the read-only built-in data', async () => {
    const { sources } = await setup();
    const list = await sources.list('t');
    expect(list.filter((s) => s.kind === 'collection').map((s) => s.name)).toEqual(expect.arrayContaining(['products', 'orders']));
    expect(list.filter((s) => s.kind === 'system').map((s) => [s.name, s.writable])).toEqual([
      ['system.shipments', false],
      ['system.warehouses', false],
      ['system.couriers', false],
    ]);
    expect(list.find((s) => s.name === 'products')!.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['id', 'createdAt', 'name', 'price']));
  });

  it('marks unique collection fields, so the builder can tell a sure match from the newest of several', async () => {
    const { service, sources } = await setup();
    await service.createCollection('t', {
      name: 'members',
      fields: [
        { key: 'email', type: 'string', required: true, unique: true },
        { key: 'team', type: 'string', required: false },
      ],
    });
    const fields = (await sources.list('t')).find((s) => s.name === 'members')!.fields;
    expect(fields.find((f) => f.key === 'email')).toMatchObject({ unique: true });
    expect(fields.find((f) => f.key === 'team')).not.toHaveProperty('unique');
  });

  it('queries shipments by any declared field and sorts them', async () => {
    const { sources } = await setup();
    const big = await sources.listRecords('t', 'system.shipments', { filter: { orderValue: { $gt: 1000 } } });
    expect(big.total).toBe(1);
    expect(big.records[0]).toMatchObject({ orderId: 'ORD-2', status: 'new' });
    expect((await sources.findRecords('t', 'system.shipments', { filter: { 'items.sku': 'MUG-9' } })).map((s) => s.orderId)).toEqual(['ORD-2']);
    expect((await sources.findRecords('t', 'system.shipments', { sort: { orderValue: 1 } })).map((s) => s.orderId)).toEqual(['ORD-1', 'ORD-2']);
    expect((await sources.findRecords('t', 'system.shipments', { sort: { orderValue: -1 } })).map((s) => s.orderId)).toEqual(['ORD-2', 'ORD-1']);
    expect(await sources.findRecords('other-tenant', 'system.shipments', {})).toEqual([]);
  });

  it('rejects fields a built-in source does not declare, naming the ones it does', async () => {
    const { sources } = await setup();
    const error = await sources.listRecords('t', 'system.shipments', { filter: { secret: 1 } }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationFailedError);
    expect((error as ValidationFailedError).issues[0].message).toMatch(/Shipments can't be filtered or sorted on “secret” — use id, orderId, status/);
  });

  it('reads warehouses and couriers in memory, with their own default order', async () => {
    const { sources, delhi } = await setup();
    expect((await sources.findRecords('t', 'system.warehouses', {})).map((w) => w.name)).toEqual(['Bhiwandi WH', 'Delhi FC']);
    expect(await sources.getRecord('t', 'system.warehouses', delhi.id)).toMatchObject({ name: 'Delhi FC' });
    const couriers = await sources.findRecords('t', 'system.couriers', { filter: { enabled: true } });
    expect(couriers.length).toBeGreaterThan(0);
    expect(couriers[0]).toMatchObject({ id: couriers[0].code, circuit: 'closed' });
    expect(await sources.getRecord('t', 'system.couriers', 'nope')).toBeNull();
  });

  it('still serves collections through the same calls', async () => {
    const { sources } = await setup();
    const [product] = await sources.findRecords('t', 'products', { filter: { sku: 'KUR-001' } });
    expect(await sources.getRecord('t', 'products', product.id as string)).toMatchObject({ sku: 'KUR-001' });
    expect(await sources.exists('t', 'products')).toBe(true);
    expect(await sources.exists('t', 'system.shipments')).toBe(true);
    expect(await sources.exists('t', 'system.nothing')).toBe(false);
  });
});
