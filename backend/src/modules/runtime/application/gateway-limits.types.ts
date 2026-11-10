import type { RateDecision, RateRule } from '../../../shared/rate-limit/rate-limit.types';
import type { GatewayResponse } from './gateway.types';

/** Which limit a rule enforces; decides the wording of the 429. */
export type LimitScope = 'endpoint' | 'api_key' | 'user' | 'ip' | 'tenant';

export interface LimitRule extends RateRule {
  scope: LimitScope;
}

/** The account-wide limits (calls per minute, 0 = off) and the cap on concurrent sync calls. */
export interface GatewayLimits {
  tenantPerMinute: number;
  apiKeyPerMinute: number;
  ipPerMinute: number;
  tenantConcurrentSync: number;
}

/** Who is calling, for per-caller limits: the API key, the signed-in user, else the client address. */
export type Caller = { kind: 'api_key' | 'user' | 'ip'; id: string };

export type Admission = { ok: true; headers: Record<string, string> } | { ok: false; response: GatewayResponse };

export type SyncSlot = { ok: true; release: () => Promise<void> } | { ok: false; response: GatewayResponse };

export type ScopedDecision = RateDecision & { scope: LimitScope };
