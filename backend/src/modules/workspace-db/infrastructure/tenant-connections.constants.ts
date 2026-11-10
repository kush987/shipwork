/** Config changes reach other server processes through this Redis channel (and at worst after the cache time). */
export const DB_CHANGED_CHANNEL = 'shipflow:workspace-db:changed';
export const CONFIG_CACHE_MS = 30_000;

/** Workspace-owned databases kept open at once; the least recently used is closed beyond this. */
export const MAX_EXTERNAL_CONNECTIONS = 100;

/** Small pools and quick failures: a workspace's slow or unreachable database must not hold up others. */
export const EXTERNAL_CONNECTION_OPTIONS = { maxPoolSize: 5, serverSelectionTimeoutMS: 5_000, connectTimeoutMS: 5_000, socketTimeoutMS: 30_000 };
export const MANAGED_CONNECTION_OPTIONS = { maxPoolSize: 50 };
