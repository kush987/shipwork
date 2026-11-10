import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { stepJobId } from '../domain/execution';
import { StepJob } from '../domain/execution.types';
import { StepScheduler } from '../domain/execution.ports';
import { TenantBacklog } from '../application/step-fairness.ports';
import { priorityForBacklog } from '../application/step-fairness';
import type { QueuedStep } from '../application/step-fairness.types';
import { STEP_QUEUE, STEP_ATTEMPTS } from './bullmq-step.scheduler.constants';

@Injectable()
export class BullmqStepScheduler extends StepScheduler {
  constructor(
    @InjectQueue(STEP_QUEUE) private readonly queue: Queue<QueuedStep>,
    private readonly backlog: TenantBacklog,
  ) {
    super();
  }

  async schedule(job: StepJob, delayMs = 0) {
    // Ready-to-run steps join their tenant's backlog; a delayed step (a wait) doesn't compete yet.
    const counted = delayMs <= 0;
    const backlog = counted ? await this.backlog.enqueued(job.tenantId) : await this.backlog.size(job.tenantId);
    await this.queue.add('step', counted ? { ...job, counted } : job, {
      // Deterministic id: the same node of the same execution can never be enqueued twice.
      jobId: stepJobId(job),
      delay: delayMs,
      // Fairness: the more a tenant already has waiting, the further back its new steps go.
      priority: priorityForBacklog(backlog),
      attempts: STEP_ATTEMPTS,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 3_600, count: 5_000 },
      removeOnFail: { age: 24 * 3_600 },
    });
  }
}
