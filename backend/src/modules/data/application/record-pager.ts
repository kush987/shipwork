import { isEmpty } from 'lodash';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { getPath } from '../../../shared/util/path';
import { parseSort } from '../../../shared/query/record-query';
import { conditionsAfter, cursorAfter, decodeCursor } from '../../../shared/query/record-cursor';
import type { SortKey } from '../../../shared/query/record-query.types';
import type { DataSourceService } from './data-source.service';
import type { SourceRecord } from '../domain/data-source.types';
import type { RecordPage } from '../domain/record-page.types';

interface NumberedPageInput {
  filter?: unknown;
  /** Empty → the source's own default order. */
  sort?: unknown;
  /** From 1. */
  page: number;
  pageSize: number;
  /** Only these fields (plus id and the timestamps). */
  fields?: string[];
}

interface CursorPageInput {
  filter?: unknown;
  order: SortKey;
  /** The previous page's nextCursor; null for the first page. */
  cursor: string | null;
  pageSize: number;
  /** Only these fields (plus id and the timestamps); the order's field is always read. */
  fields?: string[];
}

/** Numbered pages: skips to the page and counts every match, so a pager can show "page 3 of 12". */
export async function pageByNumber(sources: DataSourceService, tenantId: string, name: string, input: NumberedPageInput): Promise<RecordPage> {
  const { page, pageSize } = input;
  const { total, records } = await sources.listRecords(tenantId, name, {
    filter: input.filter,
    sort: isEmpty(input.sort) ? undefined : input.sort,
    limit: pageSize,
    skip: (page - 1) * pageSize,
    fields: input.fields,
  });
  const totalPages = Math.ceil(total / pageSize);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;
  return {
    items: records,
    pagination: {
      mode: 'pages',
      page,
      pageSize,
      totalItems: total,
      totalPages,
      hasNextPage,
      hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      // Past the end, "previous" leads back to the last page that has records.
      previousPage: hasPreviousPage ? Math.min(page - 1, Math.max(totalPages, 1)) : null,
    },
  };
}

/**
 * Infinite scroll: reads one record more than the page holds to know whether there is more, and hands
 * back a cursor to the page's last record. No counting and no skipping, so a page costs the same at
 * any depth, and records added meanwhile never make the next page repeat one.
 */
export async function pageByCursor(sources: DataSourceService, tenantId: string, name: string, input: CursorPageInput): Promise<RecordPage> {
  const { order, pageSize } = input;
  const position = input.cursor ? decodeCursor(input.cursor, order) : null;
  const sort = order.field === 'id' ? { id: order.direction } : { [order.field]: order.direction, id: order.direction };
  const wanted = pageSize + 1;
  const rows: SourceRecord[] = [];
  for (const conditions of position ? conditionsAfter(position) : [[]]) {
    if (rows.length >= wanted) break;
    const fields = input.fields && [...new Set([...input.fields, order.field])];
    rows.push(...(await sources.findRecords(tenantId, name, { filter: input.filter, sort, conditions, limit: wanted - rows.length, fields })));
  }
  const items = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;
  return {
    items,
    pagination: { mode: 'cursor', pageSize, hasMore, nextCursor: hasMore ? cursorAfter(items[items.length - 1], order, getPath) : null },
  };
}

/** The one field infinite scroll orders by: the Sort setting's only key, or `fallback` when it has none. */
export function cursorOrder(sort: unknown, fallback: SortKey): SortKey {
  if (isEmpty(sort)) return fallback;
  const keys = parseSort(sort);
  if (keys.length > 1) {
    throw new ValidationFailedError([{ message: 'Infinite scroll orders by one field (ties go by id) — keep one key in Sort, e.g. {"createdAt": -1}' }]);
  }
  return keys[0];
}
