import { Injectable, Logger } from '@nestjs/common';
import { clamp } from 'lodash';
import { newId } from '../../../shared/domain/id';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { config } from '../../../config/configuration';
import { AuditLog } from '../domain/audit-log';
import { AUDIT_ID_PREFIX, AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE } from '../domain/audit.constants';
import type { AuditEntry, AuditPage, AuditQuery } from '../domain/audit.types';

const DAY_MS = 86_400_000;

/**
 * The workspace audit log: every change made in the builder and every attempt a role didn't
 * allow. Recording never fails the request it describes; entries expire after AUDIT_RETENTION_DAYS.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly log: AuditLog) {}

  async record(entry: AuditEntry): Promise<void> {
    const at = new Date();
    try {
      await this.log.append({ ...entry, id: newId(AUDIT_ID_PREFIX), at: at.toISOString(), expiresAt: new Date(at.getTime() + config.audit.retentionDays * DAY_MS).toISOString() });
    } catch (error) {
      this.logger.warn(`Could not record ${entry.action} on ${entry.resource} in the audit log: ${(error as Error).message}`);
    }
  }

  async list(tenantId: string, query: AuditQuery): Promise<AuditPage> {
    const before = query.before?.trim();
    if (before && Number.isNaN(Date.parse(before))) throw new ValidationFailedError([{ field: 'before', message: 'before must be a date and time (ISO 8601)' }]);
    const decision = query.decision;
    if (decision && decision !== 'allowed' && decision !== 'denied') throw new ValidationFailedError([{ field: 'decision', message: 'decision is allowed or denied' }]);
    const limit = clamp(Number(query.limit) || AUDIT_PAGE_SIZE, 1, MAX_AUDIT_PAGE_SIZE);
    const items = await this.log.list(tenantId, { limit, before: before ? new Date(before).toISOString() : undefined, actor: query.actor?.trim() || undefined, decision, action: query.action?.trim() || undefined });
    return { items, nextBefore: items.length === limit ? items[items.length - 1].at : null };
  }
}
