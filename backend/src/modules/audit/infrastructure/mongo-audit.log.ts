import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { escapeRegExp } from 'lodash';
import { FilterQuery, Model } from 'mongoose';
import { toIso } from '../../../shared/persistence/mongo-mapping';
import { AuditLog } from '../domain/audit-log';
import { AuditEventDoc } from './audit.schema';
import type { AuditEvent, AuditQuery, StoredAuditEvent } from '../domain/audit.types';

const toEvent = (d: AuditEventDoc): AuditEvent => ({
  id: d._id,
  at: toIso(d.at),
  actor: d.actorUserId ? { userId: d.actorUserId, email: d.actorEmail ?? '' } : null,
  action: d.action,
  resource: d.resource,
  method: d.method,
  path: d.path,
  decision: d.decision as AuditEvent['decision'],
  status: d.status,
  ...(d.reason ? { reason: d.reason } : {}),
  ip: d.ip,
});

@Injectable()
export class MongoAuditLog extends AuditLog {
  constructor(@InjectModel(AuditEventDoc.name) private readonly model: Model<AuditEventDoc>) {
    super();
  }

  async append({ id, at, actor, expiresAt, ...rest }: StoredAuditEvent) {
    await this.model.create({ ...rest, _id: id, at: new Date(at), expiresAt: new Date(expiresAt), actorUserId: actor?.userId, actorEmail: actor?.email });
  }

  async list(tenantId: string, query: AuditQuery & { limit: number }) {
    const filter: FilterQuery<AuditEventDoc> = { tenantId };
    if (query.before) filter.at = { $lt: new Date(query.before) };
    if (query.actor) filter.actorUserId = query.actor;
    if (query.decision) filter.decision = query.decision;
    if (query.action) filter.action = { $regex: `^${escapeRegExp(query.action)}` };
    return (await this.model.find(filter).sort({ at: -1, _id: -1 }).limit(query.limit).lean()).map(toEvent);
  }
}
