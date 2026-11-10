import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/redis/redis.constants';
import { KEY_PREFIX } from '../../../shared/rate-limit/rate-limit.constants';
import { parkFallbackMs, timesParked } from '../application/step-fairness';
import { WAKE_TRIES } from '../application/step-fairness.constants';
import { STEP_QUEUE } from './bullmq-step.scheduler.constants';
import { PARKED_KEY, PARKED_TTL_MS } from './step-parking.constants';

const parkedKey = (tenantId: string) => `${KEY_PREFIX}${PARKED_KEY}${tenantId}`;

/**
 * Where steps wait while their tenant is at its cap. A parked step is a delayed BullMQ job (so it
 * survives restarts and comes back by itself after a fallback delay) whose id is also kept per
 * tenant, oldest first; when one of the tenant's steps finishes, the oldest parked one is promoted
 * at once. That keeps the tenant's slots busy without workers re-checking its backlog over and over.
 * A step parked again keeps its place (ZADD NX); a step that gets a slot removes its entry.
 */
@Injectable()
export class StepParking {
  private readonly logger = new Logger(StepParking.name);

  constructor(
    @InjectQueue(STEP_QUEUE) private readonly queue: Queue,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Parks the active `job`; the caller must then throw BullMQ's DelayedError. */
  async park(job: Job, token: string | undefined, tenantId: string): Promise<void> {
    await job.moveToDelayed(Date.now() + parkFallbackMs(timesParked(job)), token);
    try {
      await this.redis.multi().zadd(parkedKey(tenantId), 'NX', Date.now(), job.id!).pexpire(parkedKey(tenantId), PARKED_TTL_MS).exec();
    } catch (error) {
      this.logger.debug(`Could not list parked step ${job.id}: ${(error as Error).message}`); // the fallback delay brings it back
    }
  }

  /** The step got a slot (after having been parked): it no longer waits for a wake-up. */
  async forget(tenantId: string, jobId: string): Promise<void> {
    await this.redis.zrem(parkedKey(tenantId), jobId).catch(() => undefined);
  }

  /** A slot of the tenant freed up: promote the oldest parked step that is still waiting. */
  async wakeOne(tenantId: string): Promise<boolean> {
    try {
      for (let i = 0; i < WAKE_TRIES; i++) {
        const [id] = await this.redis.zpopmin(parkedKey(tenantId));
        if (!id) return false;
        const job = await Job.fromId(this.queue, id);
        // It may have come back by itself (fallback) or been parked again under a newer entry.
        if (job && (await job.isDelayed())) {
          await job.promote().catch(() => undefined);
          return true;
        }
      }
    } catch (error) {
      this.logger.debug(`Could not wake a parked step of ${tenantId}: ${(error as Error).message}`);
    }
    return false;
  }
}
