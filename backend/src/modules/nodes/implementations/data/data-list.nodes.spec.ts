import { Logger } from '@nestjs/common';
import { DataPaginateNode } from './data-paginate.node';
import { DataQueryNode } from './data-query.node';
import { inMemoryDataService } from '../../../../testing/data-fakes';
import { InMemoryShipments, RecordingPublisher, shipmentInput, warehouseFixture } from '../../../../testing/shipment-fakes';
import { ShipmentService } from '../../../shipment/application/shipment.service';
import { ShipmentsDataSource } from '../../../shipment/application/shipments.data-source';
import { toWorkflowRequest } from '../../domain/triggers';
import { NonRetryableError } from '../../../../shared/domain/errors';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';

const ctx = (config: Record<string, unknown>, query: Record<string, unknown> = {}): NodeExecutionContext => ({
  tenantId: 't',
  executionId: 'ex',
  nodeId: 'n',
  idempotencyKey: 'ex:n',
  attempt: 1,
  isFinalAttempt: true,
  config,
  data: { trigger: { event: 'http.request', data: {} }, context: {}, request: toWorkflowRequest({ method: 'get', path: '/x', query }), shipment: null },
  logger: new Logger('test'),
});

/** The settings a new Paginated list step starts with, as the builder fills them in. */
const paginated = (over: Record<string, unknown> = {}) => ({
  collection: 'orders',
  mode: 'pages',
  filter: '{}',
  sort: '{"createdAt": -1}',
  pageSize: '{{request.query.pageSize}}',
  page: '{{request.query.page}}',
  cursor: '{{request.query.cursor}}',
  saveAs: 'list',
  ...over,
});

const PRODUCT_JOIN = [{ from: 'products', localField: 'productId', as: 'product' }];

describe('list steps', () => {
  const setup = async () => {
    const { service: warehouses, delhi } = await warehouseFixture();
    const repo = new InMemoryShipments();
    await new ShipmentService(repo, new RecordingPublisher(), warehouses).create('t', shipmentInput(delhi.id, { orderId: 'ORD-1' }));
    const { service, sources } = inMemoryDataService([new ShipmentsDataSource(repo)]);
    await service.seedSamples('t');
    const [kurta] = await service.findRecords('t', 'products', { filter: { sku: 'KUR-001' } });
    for (let i = 1; i <= 7; i++) {
      await service.createRecord('t', 'orders', { customerId: `c${i % 2}`, productId: kurta.id, quantity: i, total: 1299 * i, status: 'CREATED' });
    }
    return { paginate: new DataPaginateNode(service, sources), find: new DataQueryNode(service, sources) };
  };

  describe('Paginated list', () => {
    it('pages by number from the query string, with joins, and saves { items, pagination }', async () => {
      const { paginate } = await setup();
      const result = await paginate.execute(ctx(paginated({ joins: PRODUCT_JOIN }), { page: '2', pageSize: '3' }));
      const saved = result.contextPatch!.list as { items: { quantity: number; product: { sku: string } }[]; pagination: unknown };
      expect(saved.items.map((o) => o.quantity)).toEqual([4, 3, 2]);
      expect(saved.items.every((o) => o.product.sku === 'KUR-001')).toBe(true);
      expect(saved.pagination).toEqual({ mode: 'pages', page: 2, pageSize: 3, totalItems: 7, totalPages: 3, hasNextPage: true, hasPreviousPage: true, nextPage: 3, previousPage: 1 });
      expect(result.output).toMatchObject({ count: 3, joins: [{ as: 'product', matched: 3 }] });
    });

    it('scrolls with the cursor it hands out, until there is no more', async () => {
      const { paginate } = await setup();
      const config = paginated({ mode: 'cursor' });
      const quantities: number[] = [];
      let cursor: string | null = null;
      do {
        const result = await paginate.execute(ctx(config, { pageSize: '3', ...(cursor ? { cursor } : {}) }));
        const saved = result.contextPatch!.list as { items: { quantity: number }[]; pagination: { nextCursor: string | null } };
        quantities.push(...saved.items.map((o) => o.quantity));
        cursor = saved.pagination.nextCursor;
      } while (cursor);
      expect(quantities).toEqual([7, 6, 5, 4, 3, 2, 1]);
    });

    it('uses 20 when no size is asked for, and at most 100', async () => {
      const { paginate } = await setup();
      const sizeOf = async (query: Record<string, unknown>) =>
        ((await paginate.execute(ctx(paginated(), query))).contextPatch!.list as { pagination: { pageSize: number } }).pagination.pageSize;
      expect(await sizeOf({})).toBe(20);
      expect(await sizeOf({ pageSize: '5000' })).toBe(100);
    });

    it('fails without retry on a bad page, size or cursor, so the Failed path can answer 400', async () => {
      const { paginate } = await setup();
      await expect(paginate.execute(ctx(paginated(), { page: '0' }))).rejects.toThrow(new NonRetryableError('Page must be a whole number from 1 — got “0”'));
      await expect(paginate.execute(ctx(paginated(), { pageSize: 'ten' }))).rejects.toThrow('Page size must be a whole number from 1 — got “ten”');
      const badCursor = paginate.execute(ctx(paginated({ mode: 'cursor' }), { cursor: 'abc' }));
      await expect(badCursor).rejects.toThrow(NonRetryableError);
      await expect(badCursor).rejects.toThrow(/cursor is not valid/);
    });

    it('checks its settings before publishing', async () => {
      const { paginate } = await setup();
      expect(paginate.validateConfig(paginated())).toEqual([]);
      expect(paginate.validateConfig(paginated({ mode: 'cursor', sort: { createdAt: -1, id: 1 } }))).toEqual([
        'Infinite scroll orders by one field (ties go by id) — keep one key in Sort, e.g. {"createdAt": -1}',
      ]);
      expect(paginate.validateConfig(paginated({ mode: 'sideways' }))[0]).toMatch(/^Pagination must be/);
      const fields = paginate.definition.configSchema;
      expect(fields.find((f) => f.key === 'page')).toMatchObject({ visibleWhen: { key: 'mode', values: ['pages'] } });
      expect(fields.find((f) => f.key === 'cursor')).toMatchObject({ visibleWhen: { key: 'mode', values: ['cursor'] } });
    });
  });

  describe('Find records with joins', () => {
    it('attaches related records and says what each join did', async () => {
      const { find } = await setup();
      const result = await find.execute(
        ctx({ collection: 'orders', filter: { customerId: 'c1' }, sort: { quantity: 1 }, limit: 50, joins: PRODUCT_JOIN, saveAs: 'orders' }),
      );
      const orders = result.contextPatch!.orders as { quantity: number; product: { name: string } }[];
      expect(orders.map((o) => [o.quantity, o.product.name])).toEqual([
        [1, 'Cotton kurta'],
        [3, 'Cotton kurta'],
        [5, 'Cotton kurta'],
        [7, 'Cotton kurta'],
      ]);
      expect(result.output).toMatchObject({ count: 4, joins: [{ as: 'product', from: 'products', keys: 1, matched: 4 }] });
    });

    it('names the join a failure came from', async () => {
      const { find } = await setup();
      const run = find.execute(ctx({ collection: 'orders', joins: [{ from: 'prodcts', localField: 'productId', as: 'product' }], saveAs: 'orders' }));
      await expect(run).rejects.toThrow(/^Join “product”: .*prodcts/);
    });

    it('reports join problems before publishing, built-in fields included', async () => {
      const { find } = await setup();
      expect(find.validateConfig({ collection: 'orders', joins: '[{"from": "system.shipments", "localField": "ref", "foreignField": "orderId", "as": "shipment"}]' })).toEqual([]);
      expect(find.validateConfig({ collection: 'orders', joins: [{ from: 'system.shipments', localField: 'ref', foreignField: 'nope', as: 'shipment' }] })[0]).toMatch(
        /^Join “shipment”: Shipments has no field “nope” — use id, orderId/,
      );
      expect(find.validateConfig({ collection: 'orders', joins: [{ from: 'system.planets', localField: 'x', as: 'p' }] })).toEqual([
        'Join “p”: “system.planets” is not built-in data',
      ]);
      expect(find.validateConfig({ collection: 'orders', joins: '[{"from": ' })).toEqual(['Joins is not valid JSON']);
    });
  });
});
