/** Jobs in one queue by state — `waiting` is the backlog to autoscale workers on. */
export type QueueCounts = Record<'waiting' | 'active' | 'delayed' | 'failed', number>;

export interface LoadReport {
  role: string;
  time: string;
  queues: { steps: QueueCounts; events: QueueCounts };
  /** Tenant fairness on the step queue: the cap, and the tenants with the most waiting steps. */
  fairness: { tenantMaxActiveSteps: number; busiestTenants: { tenantId: string; queued: number; running: number }[] };
  /** Code sandbox threads of this instance; null when user code runs in-process (SANDBOX_THREADS=0). */
  sandbox: { threads: number; busy: number; queued: number } | null;
}
