import { Inject, Injectable } from '@nestjs/common';
import { ConcurrencyLimiter } from '../../../shared/rate-limit/rate-limit.ports';
import { STEP_FAIRNESS_OPTIONS } from './step-fairness.constants';
import type { StepFairnessOptions, StepLease } from './step-fairness.types';

const slotsKey = (tenantId: string) => `steps:${tenantId}`;

/**
 * Caps how many steps of one tenant run at the same moment across every worker, so one tenant can
 * never take all the worker slots. Slots are leases (ConcurrencyLimiter) that expire on their own.
 */
@Injectable()
export class TenantStepCap {
  constructor(
    private readonly limiter: ConcurrencyLimiter,
    @Inject(STEP_FAIRNESS_OPTIONS) private readonly options: StepFairnessOptions,
  ) {}

  get max() {
    return this.options.tenantMaxActiveSteps;
  }

  /** A slot for one step, or null when the tenant already runs `max` steps. */
  async acquire(tenantId: string): Promise<StepLease | null> {
    if (this.max <= 0) return { tenantId, lease: null };
    const lease = await this.limiter.acquire(slotsKey(tenantId), this.max, this.options.leaseMs);
    return lease ? { tenantId, lease } : null;
  }

  async release({ tenantId, lease }: StepLease): Promise<void> {
    if (lease) await this.limiter.release(slotsKey(tenantId), lease);
  }

  running(tenantId: string): Promise<number> {
    return this.limiter.count(slotsKey(tenantId));
  }
}
