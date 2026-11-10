import { inMemoryDataService } from '../../../testing/data-fakes';
import { cursorOrder, pageByCursor, pageByNumber } from './record-pager';
import { encodeCursor } from '../../../shared/query/record-cursor';
import { ValidationFailedError } from '../../../shared/domain/errors';
import type { SortKey } from '../../../shared/query/record-query.types';
import type { RecordPage } from '../domain/record-page.types';

/** 23 records whose `rank` has ties, nulls and gaps — what makes cursor pagination go wrong. */
const RANKS = [3, 1, null, 2, 1, 5, undefined, 2, 1, 4, 3, null, 2, 5, 1, undefined, 4, 3, 2, 1, 5, null, 3];

const setup = async () => {
  const { service, sources } = inMemoryDataService();
  await service.createCollection('t', { name: 'items', fields: [{ key: 'rank', type: 'number', required: false }] });
  for (const [i, rank] of RANKS.entries()) await service.createRecord('t', 'items', rank === undefined ? { n: i } : { n: i, rank });
  return { service, sources };
};

const cursorInfo = (page: RecordPage) => page.pagination as Extract<RecordPage['pagination'], { mode: 'cursor' }>;
const pagesInfo = (page: RecordPage) => page.pagination as Extract<RecordPage['pagination'], { mode: 'pages' }>;

describe('Paginated lists', () => {
  describe('infinite scroll (cursor)', () => {
    const orders: SortKey[] = [
      { field: 'rank', direction: 1 },
      { field: 'rank', direction: -1 },
      { field: 'createdAt', direction: -1 },
      { field: 'id', direction: 1 },
    ];

    it.each(orders)('walks every record exactly once, in order, by $field $direction', async (order) => {
      const { sources } = await setup();
      const sort = order.field === 'id' ? { id: order.direction } : { [order.field]: order.direction, id: order.direction };
      const expected = (await sources.findRecords('t', 'items', { sort, limit: 500 })).map((r) => r.id);

      const seen: unknown[] = [];
      let cursor: string | null = null;
      for (let pages = 0; pages < 50; pages++) {
        const page = await pageByCursor(sources, 't', 'items', { order, cursor, pageSize: 4 });
        seen.push(...page.items.map((r) => r.id));
        cursor = cursorInfo(page).nextCursor;
        expect(cursorInfo(page).hasMore).toBe(cursor !== null);
        if (!cursor) break;
      }
      expect(seen).toEqual(expected);
      expect(seen).toHaveLength(RANKS.length);
    });

    it('keeps going where it stopped while new records arrive at the top of the feed', async () => {
      const { service, sources } = await setup();
      const order: SortKey = { field: 'createdAt', direction: -1 };
      const before = (await sources.findRecords('t', 'items', { sort: { createdAt: -1, id: -1 }, limit: 500 })).map((r) => r.id);
      const first = await pageByCursor(sources, 't', 'items', { order, cursor: null, pageSize: 5 });
      for (let i = 0; i < 3; i++) await service.createRecord('t', 'items', { n: 100 + i, rank: 9 });
      const second = await pageByCursor(sources, 't', 'items', { order, cursor: cursorInfo(first).nextCursor, pageSize: 5 });
      expect(first.items.map((r) => r.id)).toEqual(before.slice(0, 5));
      expect(second.items.map((r) => r.id)).toEqual(before.slice(5, 10));
    });

    it('combines with the filter, even on the field it orders by', async () => {
      const { sources } = await setup();
      const order: SortKey = { field: 'rank', direction: -1 };
      const filter = { rank: { $lt: 4 } };
      const expected = (await sources.findRecords('t', 'items', { filter, sort: { rank: -1, id: -1 }, limit: 500 })).map((r) => r.id);
      const first = await pageByCursor(sources, 't', 'items', { filter, order, cursor: null, pageSize: 6 });
      const second = await pageByCursor(sources, 't', 'items', { filter, order, cursor: cursorInfo(first).nextCursor, pageSize: 50 });
      expect([...first.items, ...second.items].map((r) => r.id)).toEqual(expected);
      expect(cursorInfo(second)).toEqual({ mode: 'cursor', pageSize: 50, hasMore: false, nextCursor: null });
    });

    it('rejects a cursor that is garbage or was made for another order', async () => {
      const { sources } = await setup();
      const order: SortKey = { field: 'rank', direction: 1 };
      const garbage = await pageByCursor(sources, 't', 'items', { order, cursor: 'not-a-cursor', pageSize: 5 }).catch((e) => e);
      expect(garbage).toBeInstanceOf(ValidationFailedError);
      expect(garbage.issues[0].message).toMatch(/cursor is not valid/);
      const other = encodeCursor({ field: 'createdAt', direction: -1, value: '2026-01-01T00:00:00.000Z', id: 'rec_1' });
      const mismatch = await pageByCursor(sources, 't', 'items', { order, cursor: other, pageSize: 5 }).catch((e) => e);
      expect(mismatch.issues[0].message).toMatch(/different order/);
    });

    it('orders by one field: the Sort setting’s only key, or the fallback', () => {
      const fallback: SortKey = { field: 'createdAt', direction: -1 };
      expect(cursorOrder({}, fallback)).toBe(fallback);
      expect(cursorOrder(undefined, fallback)).toBe(fallback);
      expect(cursorOrder({ rank: 1 }, fallback)).toEqual({ field: 'rank', direction: 1 });
      expect(() => cursorOrder({ rank: 1, n: -1 }, fallback)).toThrow(ValidationFailedError);
    });
  });

  describe('page numbers', () => {
    it('returns the page with totals and the neighbouring page numbers', async () => {
      const { sources } = await setup();
      const all = (await sources.findRecords('t', 'items', { sort: { n: 1 }, limit: 500 })).map((r) => r.n);
      const third = await pageByNumber(sources, 't', 'items', { sort: { n: 1 }, page: 3, pageSize: 10 });
      expect(third.items.map((r) => r.n)).toEqual(all.slice(20));
      expect(pagesInfo(third)).toEqual({
        mode: 'pages',
        page: 3,
        pageSize: 10,
        totalItems: 23,
        totalPages: 3,
        hasNextPage: false,
        hasPreviousPage: true,
        nextPage: null,
        previousPage: 2,
      });
      const firstPage = pagesInfo(await pageByNumber(sources, 't', 'items', { page: 1, pageSize: 10 }));
      expect(firstPage).toMatchObject({ hasNextPage: true, nextPage: 2, hasPreviousPage: false, previousPage: null });
    });

    it('past the end: no items, and "previous" leads back to the last page', async () => {
      const { sources } = await setup();
      const page = await pageByNumber(sources, 't', 'items', { page: 9, pageSize: 10, filter: { rank: 5 } });
      expect(page.items).toEqual([]);
      expect(pagesInfo(page)).toMatchObject({ totalItems: 3, totalPages: 1, hasNextPage: false, previousPage: 1 });
    });
  });
});
