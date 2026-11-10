import { Inject, Injectable } from '@nestjs/common';
import { ConcurrencyLimiter, RateLimiter } from '../../../shared/rate-limit/rate-limit.ports';
import { gatewayError } from './gateway.helpers';
import { callerOf, rateLimitHeaders, rateRules, retryAfterSeconds } from './gateway-limits.helpers';
import { CONCURRENCY_RETRY_AFTER_SECONDS, GATEWAY_LIMITS, LIMIT_MESSAGES, SYNC_SLOT_MARGIN_MS } from './gateway-limits.constants';
import type { Admission, GatewayLimits, ScopedDecision, SyncSlot } from './gateway-limits.types';
import type { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import type { InboundRequest, Principal } from './gateway.types';

/**
 * The gateway's protection stage: per-minute limits (endpoint → caller → account) and a cap on
 * concurrent synchronous calls per account. Counting happens in Redis through the limiter ports,
 * so it holds across every runtime replica; if Redis is down, calls go through.
 */
@Injectable()
export class EndpointThrottle {
  constructor(
    private readonly rates: RateLimiter,
    private readonly concurrency: ConcurrencyLimiter,
    @Inject(GATEWAY_LIMITS) private readonly limits: GatewayLimits,
  ) {}

  /** Counts the call against every limit that applies; the first one exhausted refuses it (429). */
  async admit(req: Pick<InboundRequest, 'tenantId' | 'clientIp'>, endpoint: ApiEndpoint, principal: Principal): Promise<Admission> {
    const decisions: ScopedDecision[] = [];
    for (const rule of rateRules(req.tenantId, endpoint, callerOf(principal, req.clientIp), this.limits)) {
      const decision = { ...(await this.rates.consume(rule)), scope: rule.scope };
      decisions.push(decision);
      if (!decision.allowed) {
        const seconds = retryAfterSeconds(decision.retryAfterMs);
        const response = gatewayError(429, 'rate_limited', `${LIMIT_MESSAGES[rule.scope]} — try again in ${seconds} s`, {
          limit: rule.limit,
          window: 'minute',
          retryAfterSeconds: seconds,
        });
        return { ok: false, response: { ...response, headers: { ...rateLimitHeaders(decisions), 'retry-after': String(seconds) } } };
      }
    }
    return { ok: true, headers: rateLimitHeaders(decisions) };
  }

  /** Holds one of the account's concurrent sync slots for the call; release it when the call answers. */
  async syncSlot(tenantId: string, endpoint: Pick<ApiEndpoint, 'timeoutMs'>): Promise<SyncSlot> {
    const max = this.limits.tenantConcurrentSync;
    if (max <= 0) return { ok: true, release: async () => undefined };
    const key = `sync:${tenantId}`;
    const lease = await this.concurrency.acquire(key, max, endpoint.timeoutMs + SYNC_SLOT_MARGIN_MS);
    if (!lease) {
      const response = gatewayError(429, 'too_many_concurrent_calls', `This account already has ${max} calls in progress — try again shortly`, {
        limit: max,
        retryAfterSeconds: CONCURRENCY_RETRY_AFTER_SECONDS,
      });
      return { ok: false, response: { ...response, headers: { 'retry-after': String(CONCURRENCY_RETRY_AFTER_SECONDS) } } };
    }
    return { ok: true, release: () => this.concurrency.release(key, lease) };
  }
}
