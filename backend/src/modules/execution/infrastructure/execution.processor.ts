import { Processor, WorkerHost } from '@nestjs/bullmq';
import { DelayedError, Job } from 'bullmq';
import { ExecutionEngine } from '../application/execution-engine';
import { TenantStepCap } from '../application/tenant-step-cap';
import { TenantBacklog } from '../application/step-fairness.ports';
import { config } from '../../../config/configuration';
import { timesParked } from '../application/step-fairness';
import type { QueuedStep } from '../application/step-fairness.types';
import { StepParking } from './step-parking';
import { STEP_ATTEMPTS, STEP_QUEUE } from './bullmq-step.scheduler.constants';

/**
 * Thin adapter: BullMQ delivers a job, the engine does the work. Scale by running more workers.
 * Fairness: a step first takes one of its tenant's slots. A tenant at its cap gets the step parked
 * (not counted as an attempt) and the worker moves on to other tenants' steps; the step is woken
 * as soon as one of its tenant's running steps finishes.
 */
@Processor(STEP_QUEUE, { concurrency: config.workerConcurrency })
export class ExecutionProcessor extends WorkerHost {
  constructor(
    private readonly engine: ExecutionEngine,
    private readonly cap: TenantStepCap,
    private readonly backlog: TenantBacklog,
    private readonly parking: StepParking,
  ) {
    super();
  }

  async process(job: Job<QueuedStep>, token?: string) {
    const { counted, ...step } = job.data;
    const slot = await this.cap.acquire(step.tenantId);
    if (!slot) {
      await this.parking.park(job, token, step.tenantId);
      // A slot may have freed between the check and parking; don't leave the step waiting for it.
      if ((await this.cap.running(step.tenantId)) < this.cap.max) await this.parking.wakeOne(step.tenantId);
      throw new DelayedError();
    }
    try {
      if (timesParked(job) > 0) await this.parking.forget(step.tenantId, job.id!);
      if (counted) await this.backlog.started(step.tenantId, job.id!);
      const attempt = job.attemptsMade + 1;
      await this.engine.runStep(step, attempt, attempt >= (job.opts.attempts ?? STEP_ATTEMPTS));
    } finally {
      await this.cap.release(slot);
      if (slot.lease) await this.parking.wakeOne(step.tenantId);
    }
  }
}
