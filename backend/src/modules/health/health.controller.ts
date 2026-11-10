import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { config } from '../../config/configuration';
import { HEALTH_ROUTE } from '../../config/planes.constants';
import { STEP_QUEUE } from '../execution/infrastructure/bullmq-step.scheduler.constants';
import { DOMAIN_EVENTS_QUEUE } from '../../shared/events/domain-events.constants';
import { CodeSandbox } from '../custom-node/application/code-sandbox.ports';
import { ThreadedCodeSandbox } from '../custom-node/infrastructure/threaded-code-sandbox';
import { TenantBacklog } from '../execution/application/step-fairness.ports';
import { TenantStepCap } from '../execution/application/tenant-step-cap';
import { BUSIEST_TENANTS } from './health.constants';
import type { LoadReport, QueueCounts } from './health.types';
import { OpsOnly, Public } from '../../shared/auth/auth.decorators';

const counts = async (queue: Queue): Promise<QueueCounts> => {
  const { waiting = 0, prioritized = 0, paused = 0, active = 0, delayed = 0, failed = 0 } = await queue.getJobCounts(
    'waiting',
    'prioritized',
    'paused',
    'active',
    'delayed',
    'failed',
  );
  // Prioritized jobs (every workflow step) and jobs of a paused queue are backlog too.
  return { waiting: waiting + prioritized + paused, active, delayed, failed };
};

/** Served by every HTTP role. `/health` is public; `/health/load` shows every workspace's backlog, so it is ops-only. */
@ApiTags('health')
@Controller(HEALTH_ROUTE)
export class HealthController {
  constructor(
    @InjectQueue(STEP_QUEUE) private readonly steps: Queue,
    @InjectQueue(DOMAIN_EVENTS_QUEUE) private readonly events: Queue,
    private readonly sandbox: CodeSandbox,
    private readonly backlog: TenantBacklog,
    private readonly cap: TenantStepCap,
  ) {}

  /** Liveness probe for load balancers: no dependencies touched, no sign-in. */
  @Public()
  @Get()
  health() {
    return { status: 'ok', role: config.role, time: new Date().toISOString() };
  }

  /**
   * Backlog and busyness, for dashboards and autoscaling: scale workers on `queues.*.waiting`,
   * runtime replicas on latency and `sandbox.queued`.
   */
  @OpsOnly()
  @Get('load')
  async load(): Promise<LoadReport> {
    const [steps, events, busiest] = await Promise.all([counts(this.steps), counts(this.events), this.backlog.largest(BUSIEST_TENANTS)]);
    const busiestTenants = await Promise.all(busiest.map(async (t) => ({ ...t, running: await this.cap.running(t.tenantId) })));
    return {
      role: config.role,
      time: new Date().toISOString(),
      queues: { steps, events },
      fairness: { tenantMaxActiveSteps: this.cap.max, busiestTenants },
      sandbox: this.sandbox instanceof ThreadedCodeSandbox ? this.sandbox.stats() : null,
    };
  }
}
