/** A process owns a workspace's change feed while it renews this lease (another takes over when it lapses). */
export const FEED_LEASE_MS = 30_000;
export const FEED_RENEW_MS = 10_000;
/** How often every process checks which workspaces need a feed (and takes over unowned ones). */
export const FEED_SYNC_MS = 30_000;
/** Wait before reopening a feed that stopped. */
export const FEED_REOPEN_MS = 5_000;

/**
 * Runs one workflow may get from record changes per minute. A workflow that writes to the collection
 * it watches can start itself again and again; past this it is skipped (and logged) until the next minute.
 */
export const MAX_RECORD_RUNS_PER_MINUTE = 600;

export const REDIS_KEYS = {
  lease: (tenantId: string) => `shipflow:record-feed:${tenantId}`,
  resume: (tenantId: string) => `shipflow:record-feed:${tenantId}:resume`,
  runs: (workflowId: string, minute: number) => `shipflow:record-runs:${workflowId}:${minute}`,
};
