/** Per-tenant sorted set of parked step job ids, oldest first (under the shared `shipflow:` prefix). */
export const PARKED_KEY = 'parked-steps:';

/** A parked set disappears after this long without parking activity. */
export const PARKED_TTL_MS = 60 * 60_000;
