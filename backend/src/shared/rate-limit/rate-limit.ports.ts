import type { RateDecision, RateRule } from './rate-limit.types';

/** Counts calls against a rule and says whether one more may pass (port; Redis or memory). */
export abstract class RateLimiter {
  abstract consume(rule: RateRule): Promise<RateDecision>;
}

/**
 * Caps how many things run at once for a key (a semaphore). A lease expires on its own after
 * `leaseMs`, so a crashed process can't hold a slot forever.
 */
export abstract class ConcurrencyLimiter {
  /** A lease id, or null when `max` are already running. */
  abstract acquire(key: string, max: number, leaseMs: number): Promise<string | null>;
  abstract release(key: string, lease: string): Promise<void>;
  abstract count(key: string): Promise<number>;
}
