import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { orderBy } from 'lodash';
import { REDIS } from '../../../shared/redis/redis.constants';
import { KEY_PREFIX } from '../../../shared/rate-limit/rate-limit.constants';
import { TenantBacklog } from '../application/step-fairness.ports';
import { BACKLOG_TTL_MS, STARTED_MARKER_TTL_MS } from '../application/step-fairness.constants';
import { BACKLOG_KEY, ENQUEUED_SCRIPT, STARTED_KEY, STARTED_SCRIPT } from './redis-tenant-backlog.constants';
import type { TenantLoad } from '../application/step-fairness.types';

const backlogKey = (tenantId: string) => `${KEY_PREFIX}${BACKLOG_KEY}${tenantId}`;

/**
 * Per-tenant backlog counters in Redis, shared by every worker and scheduler. Errors are swallowed
 * (counted as 0): the counter only orders work, it must never stop a step from being queued or run.
 */
@Injectable()
export class RedisTenantBacklog extends TenantBacklog {
  private readonly logger = new Logger(RedisTenantBacklog.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async enqueued(tenantId: string): Promise<number> {
    return this.safely(async () => Number(await this.redis.eval(ENQUEUED_SCRIPT, 1, backlogKey(tenantId), BACKLOG_TTL_MS)), 0);
  }

  async started(tenantId: string, jobId: string): Promise<void> {
    const marker = `${KEY_PREFIX}${STARTED_KEY}${jobId}`;
    await this.safely(() => this.redis.eval(STARTED_SCRIPT, 2, backlogKey(tenantId), marker, BACKLOG_TTL_MS, STARTED_MARKER_TTL_MS), null);
  }

  async size(tenantId: string): Promise<number> {
    return this.safely(async () => Number((await this.redis.get(backlogKey(tenantId))) ?? 0), 0);
  }

  async largest(limit: number): Promise<TenantLoad[]> {
    return this.safely(async () => {
      const prefix = `${KEY_PREFIX}${BACKLOG_KEY}`;
      const keys: string[] = [];
      for await (const batch of this.redis.scanStream({ match: `${prefix}*`, count: 200 })) keys.push(...(batch as string[]));
      if (!keys.length) return [];
      const values = await this.redis.mget(keys);
      const loads = keys.map((key, i) => ({ tenantId: key.slice(prefix.length), queued: Number(values[i] ?? 0) }));
      return orderBy(loads, 'queued', 'desc').slice(0, limit);
    }, []);
  }

  private async safely<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.logger.debug(`Tenant backlog unavailable: ${(error as Error).message}`);
      return fallback;
    }
  }
}
