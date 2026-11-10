import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../../shared/auth/auth.types';
import { MAX_AUDIT_PATH_LENGTH } from '../domain/audit.constants';
import type { AuditEntry } from '../domain/audit.types';

/** An audit entry describing this request (no bodies, no query string — they can hold data). */
export function requestAuditEntry(
  req: Request & AuthenticatedRequest,
  outcome: Pick<AuditEntry, 'decision' | 'status' | 'reason'>,
): AuditEntry | null {
  const { auth, access } = req;
  if (!auth?.tenantId || !access) return null;
  return {
    tenantId: auth.tenantId,
    actor: { userId: auth.userId, email: auth.email },
    action: access.action,
    resource: access.resource,
    method: req.method,
    path: (req.originalUrl ?? req.url ?? '').split('?')[0].slice(0, MAX_AUDIT_PATH_LENGTH),
    ip: req.ip ?? '',
    ...outcome,
  };
}
