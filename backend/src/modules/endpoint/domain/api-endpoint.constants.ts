export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export const ENDPOINT_MODES = ['sync', 'async'] as const;

/** none: public · api_key: server-to-server keys · jwt: signed-in users of the workspace's app. */
export const ENDPOINT_AUTH = ['none', 'api_key', 'jwt'] as const;

export const TIMEOUT_MS = { min: 1_000, max: 30_000, default: 10_000 };

/** Bounds of an endpoint's own per-caller limit (calls per minute). */
export const RATE_LIMIT_PER_MINUTE = { min: 1, max: 100_000 };

/** How long an authorizer's decision may be reused for the same caller, method and path. */
export const AUTHORIZER_CACHE_SECONDS = { min: 0, max: 300, default: 0 };
