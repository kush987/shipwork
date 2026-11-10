/** One entry in a workspace's audit log: a change someone made, or an attempt that was denied. */
export interface AuditEvent {
  id: string;
  at: string;
  /** Who did it (null for system changes). */
  actor: { userId: string; email: string } | null;
  /** The permission checked, e.g. `workflows:publish`. */
  action: string;
  /** What it was about, e.g. `workflow:wf_123`. */
  resource: string;
  method: string;
  path: string;
  decision: 'allowed' | 'denied';
  /** HTTP status of the reply (403 for denials; a 4xx/5xx when an allowed change failed). */
  status: number;
  /** Why it was denied. */
  reason?: string;
  ip: string;
}

/** What callers record; the log adds the id and time. */
export type AuditEntry = Omit<AuditEvent, 'id' | 'at'> & { tenantId: string };

export interface StoredAuditEvent extends AuditEvent {
  tenantId: string;
  expiresAt: string;
}

export interface AuditQuery {
  limit?: number;
  /** Only events before this time (ISO) — pass the previous page's `nextBefore`. */
  before?: string;
  /** Only this member's events. */
  actor?: string;
  decision?: 'allowed' | 'denied';
  /** Only actions starting with this, e.g. `workflows:` or `members:manage`. */
  action?: string;
}

export interface AuditPage {
  items: AuditEvent[];
  /** Pass as `before` for the next (older) page; null on the last page. */
  nextBefore: string | null;
}
