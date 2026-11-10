import type { AuditPage, AuditQuery, StoredAuditEvent } from './audit.types';

/** Port: where audit events are kept. Each workspace sees only its own. */
export abstract class AuditLog {
  abstract append(event: StoredAuditEvent): Promise<void>;
  /** Newest first. */
  abstract list(tenantId: string, query: Required<Pick<AuditQuery, 'limit'>> & Omit<AuditQuery, 'limit'>): Promise<AuditPage['items']>;
}
