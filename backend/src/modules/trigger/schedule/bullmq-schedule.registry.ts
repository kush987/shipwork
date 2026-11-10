import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { ScheduleSpec } from '../../nodes/domain/schedule-spec.types';
import { SCHEDULE_QUEUE } from './bullmq-schedule.registry.constants';
import { ScheduledRun } from './schedule-registry.types';
import { ScheduleRegistry } from './schedule-registry.ports';

const schedulerId = (run: ScheduledRun) => `wf:${run.tenantId}:${run.workflowId}`;

@Injectable()
export class BullmqScheduleRegistry extends ScheduleRegistry {
  constructor(@InjectQueue(SCHEDULE_QUEUE) private readonly queue: Queue<ScheduledRun>) {
    super();
  }

  async register(run: ScheduledRun, spec: ScheduleSpec) {
    // Upsert: republishing with a new schedule replaces the old timer instead of adding one.
    await this.queue.upsertJobScheduler(schedulerId(run), spec.kind === 'cron' ? { pattern: spec.pattern, tz: 'UTC' } : { every: spec.everyMs }, {
      name: 'fire',
      data: run,
      opts: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
    });
  }

  async unregister(run: ScheduledRun) {
    await this.queue.removeJobScheduler(schedulerId(run));
  }
}
