import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../../config/configuration';
import { REDIS } from './redis.constants';

@Injectable()
class RedisShutdown implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

/**
 * One client for request-path checks. Commands fail fast instead of queueing while Redis is
 * unreachable, so callers can fail open rather than hang the request.
 */
@Global()
@Module({
  providers: [
    { provide: REDIS, useFactory: () => new Redis({ ...config.redis, maxRetriesPerRequest: 1, enableOfflineQueue: false }) },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
