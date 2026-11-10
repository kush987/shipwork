export const JWKS_CACHE_MS = 10 * 60_000;
/** A token with an unknown key id may refetch the key set at most this often (no amplification). */
export const JWKS_MIN_REFRESH_MS = 30_000;
export const JWKS_TIMEOUT_MS = 5_000;
