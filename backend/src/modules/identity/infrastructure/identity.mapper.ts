import { toIso } from '../../../shared/persistence/mongo-mapping';
import type { Membership, Session, Tenant, User } from '../domain/identity.types';
import type { CustomRole } from '../domain/access.types';
import type { MembershipDoc, RoleDoc, SessionDoc, TenantDoc, UserDoc } from './identity.schema';

export const toUser = (d: UserDoc): User => ({ id: d._id, name: d.name, email: d.email, passwordHash: d.passwordHash, createdAt: toIso(d.createdAt), updatedAt: toIso(d.updatedAt) });
export const toUserDoc = (u: User) => ({ _id: u.id, name: u.name, email: u.email, passwordHash: u.passwordHash, createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt) });

export const toTenant = (d: TenantDoc): Tenant => ({ id: d._id, name: d.name, createdAt: toIso(d.createdAt) });
export const toTenantDoc = (t: Tenant) => ({ _id: t.id, name: t.name, createdAt: new Date(t.createdAt) });

export const toMembership = (d: MembershipDoc): Membership => ({ userId: d.userId, tenantId: d.tenantId, role: d.role, createdAt: toIso(d.createdAt) });

export const toRole = (d: RoleDoc): CustomRole => ({
  id: d._id,
  tenantId: d.tenantId,
  name: d.name,
  description: d.description ?? '',
  policy: d.policy,
  createdAt: toIso(d.createdAt),
  updatedAt: toIso(d.updatedAt),
});
export const toRoleDoc = (r: CustomRole) => ({
  _id: r.id,
  tenantId: r.tenantId,
  name: r.name,
  description: r.description,
  policy: r.policy,
  createdAt: new Date(r.createdAt),
  updatedAt: new Date(r.updatedAt),
});

export const toSession = (d: SessionDoc): Session => ({
  id: d._id,
  userId: d.userId,
  tokenHash: d.tokenHash,
  createdAt: toIso(d.createdAt),
  expiresAt: toIso(d.expiresAt),
  lastUsedAt: toIso(d.lastUsedAt),
});
export const toSessionDoc = (s: Session) => ({
  _id: s.id,
  userId: s.userId,
  tokenHash: s.tokenHash,
  createdAt: new Date(s.createdAt),
  expiresAt: new Date(s.expiresAt),
  lastUsedAt: new Date(s.lastUsedAt),
});
