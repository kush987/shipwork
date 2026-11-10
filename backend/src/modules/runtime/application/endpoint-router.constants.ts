/** Routes change rarely and are re-read every few seconds; local changes invalidate at once. */
export const CACHE_TTL_MS = 5_000;

export const MAX_CACHED_TENANTS = 1_000;
