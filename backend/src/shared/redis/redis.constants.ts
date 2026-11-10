/** Nest token of the shared ioredis client (rate limits, concurrency leases). Queues keep their own connections. */
export const REDIS = Symbol('REDIS');
