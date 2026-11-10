import type { LimitScope } from './gateway-limits.types';

export const LIMIT_WINDOW_MS = 60_000;

/** Nest token for the gateway's limits (config.rateLimits by default; tests pass their own). */
export const GATEWAY_LIMITS = Symbol('GATEWAY_LIMITS');

/** A sync call's slot outlives its timeout by this much before it frees itself (crashed replica). */
export const SYNC_SLOT_MARGIN_MS = 5_000;

/** Concurrent-call refusals clear quickly; suggest a short retry. */
export const CONCURRENCY_RETRY_AFTER_SECONDS = 1;

export const LIMIT_MESSAGES: Record<LimitScope, string> = {
  endpoint: 'Too many calls to this endpoint',
  api_key: 'Too many calls with this API key',
  user: 'Too many calls for this user',
  ip: 'Too many calls from your address',
  tenant: 'Too many calls to this account’s endpoints',
};
