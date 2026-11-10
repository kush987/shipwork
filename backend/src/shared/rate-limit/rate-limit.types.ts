/** At most `limit` calls per `windowMs` for `key`, with bursts up to `limit`. */
export interface RateRule {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateDecision {
  allowed: boolean;
  limit: number;
  /** Calls still allowed right now. */
  remaining: number;
  /** Until the allowance is completely refilled. */
  resetMs: number;
  /** When denied: wait this long before the next call can pass. */
  retryAfterMs: number;
  /** Counting was unavailable (Redis down) and the call was let through. */
  degraded?: boolean;
}
