import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.constants';
import { ConcurrencyLimiter, RateLimiter } from './rate-limit.ports';
import { ACQUIRE_SCRIPT, COUNT_SCRIPT, DEGRADED_LOG_INTERVAL_MS, GCRA_SCRIPT, KEY_PREFIX } from './rate-limit.constants';
import type { RateDecision, RateRule } from './rate-limit.types';

/** Logs "Redis unavailable, letting traffic through" at most once a minute. */
class DegradedLog {
  private last = 0;
  constructor(private readonly logger: Logger) {}
  warn(what: string, error: unknown) {
    if (Date.now() - this.last < DEGRADED_LOG_INTERVAL_MS) return;
    this.last = Date.now();
    this.logger.warn(`${what} unavailable (${(error as Error).message}) — letting calls through until Redis is back`);
  }
}

/**
 * Limits shared by every replica. If Redis can't answer, calls are let through (fail open):
 * a limiter outage must not become an API outage.
 */
@Injectable()
export class RedisRateLimiter extends RateLimiter {
  private readonly degraded = new DegradedLog(new Logger(RedisRateLimiter.name));

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async consume(rule: RateRule): Promise<RateDecision> {
    try {
      const [allowed, remaining, resetMs, retryAfterMs] = (await this.redis.eval(GCRA_SCRIPT, 1, KEY_PREFIX + rule.key, rule.windowMs, rule.limit)) as number[];
      return { allowed: allowed === 1, limit: rule.limit, remaining, resetMs, retryAfterMs };
    } catch (error) {
      this.degraded.warn('Rate limiting', error);
      return { allowed: true, limit: rule.limit, remaining: rule.limit, resetMs: 0, retryAfterMs: 0, degraded: true };
    }
  }
}

@Injectable()
export class RedisConcurrencyLimiter extends ConcurrencyLimiter {
  private readonly degraded = new DegradedLog(new Logger(RedisConcurrencyLimiter.name));

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async acquire(key: string, max: number, leaseMs: number): Promise<string | null> {
    const lease = randomUUID();
    try {
      return (await this.redis.eval(ACQUIRE_SCRIPT, 1, KEY_PREFIX + key, max, leaseMs, lease)) === 1 ? lease : null;
    } catch (error) {
      this.degraded.warn('Concurrency limiting', error);
      return lease;
    }
  }

  async release(key: string, lease: string): Promise<void> {
    await this.redis.zrem(KEY_PREFIX + key, lease).catch(() => undefined); // an unreleased lease expires on its own
  }

  async count(key: string): Promise<number> {
    return Number(await this.redis.eval(COUNT_SCRIPT, 1, KEY_PREFIX + key).catch(() => 0));
  }
}
