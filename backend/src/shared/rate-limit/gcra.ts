import type { RateDecision, RateRule } from './rate-limit.types';

/**
 * Generic Cell Rate Algorithm: one stored number per key (the "theoretical arrival time").
 * Equivalent to a token bucket of `limit` tokens refilled evenly over `windowMs`, but needs no
 * timer and only one read + one write. The Redis adapter runs the same steps in Lua.
 */
export function gcra(storedTat: number | null, now: number, { limit, windowMs }: Pick<RateRule, 'limit' | 'windowMs'>): { decision: RateDecision; tat: number | null } {
  const emission = windowMs / limit;
  const tat = Math.max(storedTat ?? now, now);
  const next = tat + emission;
  const allowAt = next - windowMs;
  if (allowAt > now) {
    return { decision: { allowed: false, limit, remaining: 0, resetMs: Math.ceil(tat - now), retryAfterMs: Math.ceil(allowAt - now) }, tat: null };
  }
  return {
    decision: { allowed: true, limit, remaining: Math.floor((windowMs - (next - now)) / emission), resetMs: Math.ceil(next - now), retryAfterMs: 0 },
    tat: next,
  };
}
