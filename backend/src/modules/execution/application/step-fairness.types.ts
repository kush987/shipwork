import type { StepJob } from '../domain/execution.types';

export interface StepFairnessOptions {
  /** Steps of one tenant running at once across all workers; 0 = no cap. */
  tenantMaxActiveSteps: number;
  leaseMs: number;
}

/** A slot to run one step of a tenant; `lease` is null when there is no cap. */
export interface StepLease {
  tenantId: string;
  lease: string | null;
}

/** A step job as queued: `counted` when it was added to its tenant's backlog (ready to run at once). */
export type QueuedStep = StepJob & { counted?: boolean };

export interface TenantLoad {
  tenantId: string;
  queued: number;
}
