import { minBy } from 'lodash';
import { LIMIT_WINDOW_MS } from './gateway-limits.constants';
import type { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import type { Caller, GatewayLimits, LimitRule, ScopedDecision } from './gateway-limits.types';
import type { Principal } from './gateway.types';

export function callerOf(principal: Principal, clientIp: string): Caller {
  if (principal?.type === 'api_key') return { kind: 'api_key', id: principal.id };
  if (principal?.type === 'jwt') return { kind: 'user', id: `${principal.provider}:${principal.id}` };
  return { kind: 'ip', id: clientIp || 'unknown' };
}

/**
 * The limits a call counts against, narrowest first, so a single noisy caller is stopped by its
 * own limit before it eats into the account-wide one. Rules with a limit of 0 are off.
 */
export function rateRules(tenantId: string, endpoint: Pick<ApiEndpoint, 'id' | 'rateLimitPerMinute'>, caller: Caller, limits: GatewayLimits): LimitRule[] {
  const rule = (scope: LimitRule['scope'], key: string, limit: number): LimitRule[] => (limit > 0 ? [{ scope, key, limit, windowMs: LIMIT_WINDOW_MS }] : []);
  // Signed-in users get the same allowance as an API key; anonymous callers the per-IP one.
  const perCaller = caller.kind === 'ip' ? limits.ipPerMinute : limits.apiKeyPerMinute;
  return [
    ...rule('endpoint', `rl:endpoint:${endpoint.id}:${caller.kind}:${caller.id}`, endpoint.rateLimitPerMinute ?? 0),
    ...rule(caller.kind, `rl:${caller.kind}:${tenantId}:${caller.id}`, perCaller),
    ...rule('tenant', `rl:tenant:${tenantId}`, limits.tenantPerMinute),
  ];
}

/** Standard rate-limit headers, describing the tightest limit that applies. */
export function rateLimitHeaders(decisions: ScopedDecision[]): Record<string, string> {
  const tightest = minBy(decisions, (d) => d.remaining);
  if (!tightest) return {};
  return {
    'ratelimit-limit': String(tightest.limit),
    'ratelimit-remaining': String(tightest.remaining),
    'ratelimit-reset': String(Math.ceil(tightest.resetMs / 1000)),
  };
}

export const retryAfterSeconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
