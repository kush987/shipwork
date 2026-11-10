/** An authorizer must answer quickly: it runs before every call of its endpoint. */
export const AUTHORIZER_TIMEOUT_MS = 3_000;
export const AUTHORIZER_CACHE_PREFIX = 'shipflow:authz:';
