import { Global, Module } from '@nestjs/common';
import { ConcurrencyLimiter, RateLimiter } from './rate-limit.ports';
import { RedisConcurrencyLimiter, RedisRateLimiter } from './redis-limiters';

/** Cluster-wide limiters (Redis). Used by the runtime gateway and the queue workers. */
@Global()
@Module({
  providers: [
    { provide: RateLimiter, useClass: RedisRateLimiter },
    { provide: ConcurrencyLimiter, useClass: RedisConcurrencyLimiter },
  ],
  exports: [RateLimiter, ConcurrencyLimiter],
})
export class RateLimitModule {}
