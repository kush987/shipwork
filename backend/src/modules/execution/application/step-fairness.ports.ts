import type { TenantLoad } from './step-fairness.types';

/**
 * Per-tenant count of steps waiting to run (port). Only affects ordering, so implementations may
 * be approximate, must never go below zero, and should forget idle tenants by themselves.
 */
export abstract class TenantBacklog {
  /** One more ready step for the tenant; returns the new count. */
  abstract enqueued(tenantId: string): Promise<number>;
  /** The job started running: count it down — once per job, however often it is retried or put back. */
  abstract started(tenantId: string, jobId: string): Promise<void>;
  abstract size(tenantId: string): Promise<number>;
  /** Tenants with the most waiting steps (for /health/load). */
  abstract largest(limit: number): Promise<TenantLoad[]>;
}
