import { inMemoryDataService } from '../../../testing/data-fakes';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../testing/shipment-fakes';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { ShipmentsDataSource } from '../../shipment/application/shipments.data-source';
import { joinRecords } from './record-joiner';
import { parseJoins } from '../domain/record-join';
import { JOIN_ROWS_PER_QUERY } from '../domain/record-join.constants';
import type { JoinSpec } from '../domain/record-join.types';

const join = (spec: Partial<JoinSpec> & Pick<JoinSpec, 'from' | 'localField' | 'as'>): JoinSpec => ({ foreignField: 'id', many: false, ...spec });

const setup = async () => {
  const { service: warehouses, delhi } = await warehouseFixture();
  const repo = new InMemoryShipments();
  await new ShipmentService(repo, new RecordingPublisher(), warehouses).create('t', shipmentInput(delhi.id, { orderId: 'ORD-1', orderValue: 900 }));
  const { service, sources } = inMemoryDataService([new ShipmentsDataSource(repo)]);
  await service.createCollection('t', { name: 'suppliers', fields: [{ key: 'code', type: 'number', required: true }] });
  await service.createCollection('t', { name: 'products', fields: [] });
  await service.createCollection('t', { name: 'orders', fields: [] });
  const acme = await service.createRecord('t', 'suppliers', { code: 7, name: 'Acme' });
  const mug = await service.createRecord('t', 'products', { name: 'Mug', supplierCode: '7' });
  const cap = await service.createRecord('t', 'products', { name: 'Cap', supplierCode: '8' });
  const o1 = await service.createRecord('t', 'orders', { customerId: 'c1', productId: mug.id, ref: 'ORD-1' });
  const o2 = await service.createRecord('t', 'orders', { customerId: 'c1', productId: cap.id, ref: 'ORD-2' });
  const o3 = await service.createRecord('t', 'orders', { customerId: 'c2', productId: 'rec_gone', bundle: [mug.id, cap.id, 'rec_gone'] });
  return { service, sources, acme, mug, cap, orders: [o1, o2, o3] };
};

describe('Joins', () => {
  it('attaches the related record, or null when there is none', async () => {
    const { sources, orders, mug, cap } = await setup();
    const { records, joins } = await joinRecords(sources, 't', orders, [join({ from: 'products', localField: 'productId', as: 'product' })]);
    expect(records.map((r) => (r.product as { id: string } | null)?.id ?? null)).toEqual([mug.id, cap.id, null]);
    expect(records[0]).toMatchObject({ customerId: 'c1', product: { name: 'Mug' } });
    expect(joins).toEqual([{ as: 'product', from: 'products', keys: 3, matched: 2 }]);
  });

  it('attaches every match as a list with many, matching on any field', async () => {
    const { sources, service } = await setup();
    await service.createCollection('t', { name: 'customers', fields: [] });
    const customers = [await service.createRecord('t', 'customers', { ref: 'c1' }), await service.createRecord('t', 'customers', { ref: 'c3' })];
    const { records } = await joinRecords(sources, 't', customers, [join({ from: 'orders', localField: 'ref', foreignField: 'customerId', as: 'orders', many: true })]);
    expect((records[0].orders as { ref: string }[]).map((o) => o.ref).sort()).toEqual(['ORD-1', 'ORD-2']);
    expect(records[1].orders).toEqual([]);
  });

  it('turns a list of keys into a list of matches', async () => {
    const { sources, orders } = await setup();
    const { records } = await joinRecords(sources, 't', [orders[2]], [join({ from: 'products', localField: 'bundle', as: 'items' })]);
    expect((records[0].items as { name: string }[]).map((p) => p.name)).toEqual(['Mug', 'Cap']);
  });

  it('runs joins in order, so a later one reads an earlier one — and keys meet across types', async () => {
    const { sources, orders } = await setup();
    const { records, joins } = await joinRecords(sources, 't', orders, [
      join({ from: 'products', localField: 'productId', as: 'product' }),
      // supplierCode is text ("7"), suppliers.code a number (7).
      join({ from: 'suppliers', localField: 'product.supplierCode', foreignField: 'code', as: 'supplier' }),
    ]);
    expect(records.map((r) => (r.supplier as { name: string } | null)?.name ?? null)).toEqual(['Acme', null, null]);
    expect(joins[1]).toEqual({ as: 'supplier', from: 'suppliers', keys: 2, matched: 1 });
  });

  it('joins built-in data', async () => {
    const { sources, orders } = await setup();
    const { records } = await joinRecords(sources, 't', orders, [join({ from: 'system.shipments', localField: 'ref', foreignField: 'orderId', as: 'shipment' })]);
    expect(records.map((r) => (r.shipment as { orderValue: number } | null)?.orderValue ?? null)).toEqual([900, null, null]);
  });

  it('splits a lookup that comes back full, so no key loses its match', async () => {
    const { sources, service } = await setup();
    await service.createCollection('t', { name: 'events', fields: [] });
    for (let i = 0; i < JOIN_ROWS_PER_QUERY + 20; i++) await service.createRecord('t', 'events', { key: i < 20 ? 'rare' : 'busy', i });
    const rows = [{ id: 'a', k: 'busy' }, { id: 'b', k: 'rare' }];
    const single = await joinRecords(sources, 't', rows, [join({ from: 'events', localField: 'k', foreignField: 'key', as: 'latest' })]);
    // Newest first: the busy key's last event and the rare key's last one, though one query can't hold both groups.
    expect(single.records.map((r) => (r.latest as { i: number }).i)).toEqual([JOIN_ROWS_PER_QUERY + 19, 19]);
    expect(single.joins[0]).not.toHaveProperty('truncated');
    const all = await joinRecords(sources, 't', rows, [join({ from: 'events', localField: 'k', foreignField: 'key', as: 'events', many: true })]);
    expect((all.records[1].events as unknown[]).length).toBe(20);
    expect(all.joins[0]).toMatchObject({ truncated: true });
  });

  it('checks the settings and names every problem', () => {
    expect(parseJoins(undefined)).toEqual({ joins: [], issues: [] });
    expect(parseJoins({ from: 'products', localField: 'productId', as: 'product' }).joins).toEqual([
      { from: 'products', localField: 'productId', foreignField: 'id', as: 'product', many: false },
    ]);
    expect(parseJoins('nope').issues[0]).toMatch(/must be a list/);
    const { issues } = parseJoins([
      { from: 'Bad Name', localField: 'x', as: 'a' },
      { from: 'products', localfield: 'productId', as: 'p.q' },
      { from: 'products', localField: 'productId', as: 'dup', many: 'yes' },
    ]);
    expect(issues).toEqual([
      'Join 1: “Bad Name” is not a valid collection name',
      'Join 2: unknown setting “localfield” — use from, localField, foreignField, as, many',
      'Join 2: “localField” must be a field name such as productId or customer.id',
      'Join 2: “as” must be a field name such as product (letters, digits, _)',
      'Join 3: “many” must be true or false',
    ]);
    const twice = { from: 'products', localField: 'productId', as: 'p' };
    expect(parseJoins([twice, twice]).issues).toEqual(['Two joins save as “p” — give each its own name']);
    expect(parseJoins(Array(6).fill(twice)).issues[0]).toMatch(/at most 5 joins/);
  });
});
