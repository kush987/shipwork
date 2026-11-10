import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ScheduleTriggerService } from './schedule-trigger.service';
import { SCHEDULE_QUEUE } from './bullmq-schedule.registry.constants';
import { ScheduledRun } from './schedule-registry.types';

/** Thin adapter: a schedule tick from BullMQ starts one run. */
@Processor(SCHEDULE_QUEUE)
export class ScheduleProcessor extends WorkerHost {
  constructor(private readonly schedules: ScheduleTriggerService) {
    super();
  }

  async process(job: Job<ScheduledRun>) {
    await this.schedules.fire(job.data, new Date(job.timestamp));
  }
}
