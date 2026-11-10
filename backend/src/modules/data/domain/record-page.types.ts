import type { PAGINATION_MODES } from './record-page.constants';
import type { SourceRecord } from './data-source.types';

export type PaginationMode = (typeof PAGINATION_MODES)[number];

/** Numbered pages: jump to any page, with totals for a pager. */
export interface PagesInfo {
  mode: 'pages';
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: number | null;
  previousPage: number | null;
}

/** Infinite scroll: pass `nextCursor` back to get the next batch; null when there is no more. */
export interface CursorInfo {
  mode: 'cursor';
  pageSize: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface RecordPage {
  items: SourceRecord[];
  pagination: PagesInfo | CursorInfo;
}
