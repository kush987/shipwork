/** Records per page when the caller asks for no size. */
export const DEFAULT_PAGE_SIZE = 20;

/** The most records one page returns; larger requests get this many. */
export const MAX_PAGE_SIZE = 100;

/** How a list is paged: numbered pages, or a cursor to the next batch (infinite scroll). */
export const PAGINATION_MODES = ['pages', 'cursor'] as const;
