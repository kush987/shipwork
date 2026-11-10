import { randomUUID } from 'crypto';
import { ConcurrencyLimiter, RateLimiter } from './rate-limit.ports';
import { gcra } from './gcra';
import type { RateDecision, RateRule } from './rate-limit.types';

/** Single-process limiters with the same semantics as the Redis ones (tests; one-process setups). */
export class InMemoryRateLimiter extends RateLimiter {
  private readonly tats = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {
    super();
  }

  async consume(rule: RateRule): Promise<RateDecision> {
    const { decision, tat } = gcra(this.tats.get(rule.key) ?? null, this.now(), rule);
    if (tat !== null) this.tats.set(rule.key, tat);
    return decision;
  }
}

export class InMemoryConcurrencyLimiter extends ConcurrencyLimiter {
  private readonly leases = new Map<string, Map<string, number>>();

  constructor(private readonly now: () => number = Date.now) {
    super();
  }

  private live(key: string) {
    const leases = this.leases.get(key) ?? new Map<string, number>();
    for (const [lease, expiresAt] of leases) if (expiresAt <= this.now()) leases.delete(lease);
    this.leases.set(key, leases);
    return leases;
  }

  async acquire(key: string, max: number, leaseMs: number) {
    const leases = this.live(key);
    if (leases.size >= max) return null;
    const lease = randomUUID();
    leases.set(lease, this.now() + leaseMs);
    return lease;
  }

  async release(key: string, lease: string) {
    this.leases.get(key)?.delete(lease);
  }

  async count(key: string) {
    return this.live(key).size;
  }
}
