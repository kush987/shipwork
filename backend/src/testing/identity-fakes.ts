import { MembershipRepository, RoleRepository, SessionRepository, TenantRepository, UserRepository } from '../modules/identity/domain/identity.repository';
import { AccessService } from '../modules/identity/application/access.service';
import { AuthService } from '../modules/identity/application/auth.service';
import { MembersService } from '../modules/identity/application/members.service';
import { RolesService } from '../modules/identity/application/roles.service';
import { AuditService } from '../modules/audit/application/audit.service';
import { AuditLog } from '../modules/audit/domain/audit-log';
import { SessionIssuer } from '../modules/identity/application/session-issuer';
import { InMemoryRateLimiter } from '../shared/rate-limit/in-memory-limiters';
import type { Membership, Session, Tenant, User } from '../modules/identity/domain/identity.types';
import type { CustomRole } from '../modules/identity/domain/access.types';
import type { AuditQuery, StoredAuditEvent } from '../modules/audit/domain/audit.types';

export class InMemoryUsers extends UserRepository {
  readonly rows = new Map<string, User>();
  async create(u: User) {
    if ([...this.rows.values()].some((x) => x.email === u.email)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    this.rows.set(u.id, structuredClone(u));
  }
  async findById(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async findByEmail(email: string) {
    return structuredClone([...this.rows.values()].find((u) => u.email === email) ?? null);
  }
  async findByIds(ids: string[]) {
    return ids.flatMap((id) => (this.rows.has(id) ? [structuredClone(this.rows.get(id)!)] : []));
  }
  async setPassword(id: string, passwordHash: string, at: string) {
    Object.assign(this.rows.get(id)!, { passwordHash, updatedAt: at });
  }
}

export class InMemoryTenants extends TenantRepository {
  readonly rows = new Map<string, Tenant>();
  async create(t: Tenant) {
    this.rows.set(t.id, structuredClone(t));
  }
  async findById(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async findByIds(ids: string[]) {
    return ids.flatMap((id) => (this.rows.has(id) ? [structuredClone(this.rows.get(id)!)] : []));
  }
}

export class InMemoryMemberships extends MembershipRepository {
  rows: Membership[] = [];
  async add(m: Membership) {
    this.rows.push(structuredClone(m));
  }
  async find(userId: string, tenantId: string) {
    return structuredClone(this.rows.find((m) => m.userId === userId && m.tenantId === tenantId) ?? null);
  }
  async forUser(userId: string) {
    return structuredClone(this.rows.filter((m) => m.userId === userId));
  }
  async forTenant(tenantId: string) {
    return structuredClone(this.rows.filter((m) => m.tenantId === tenantId));
  }
  async setRole(userId: string, tenantId: string, role: string) {
    const m = this.rows.find((x) => x.userId === userId && x.tenantId === tenantId);
    if (m) m.role = role;
  }
  async remove(userId: string, tenantId: string) {
    this.rows = this.rows.filter((m) => !(m.userId === userId && m.tenantId === tenantId));
  }
}

export class InMemorySessions extends SessionRepository {
  readonly rows = new Map<string, Session>();
  async create(s: Session) {
    this.rows.set(s.id, structuredClone(s));
  }
  async findByTokenHash(hash: string) {
    return structuredClone([...this.rows.values()].find((s) => s.tokenHash === hash) ?? null);
  }
  async touch(id: string, at: string) {
    const s = this.rows.get(id);
    if (s) s.lastUsedAt = at;
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async deleteForUser(userId: string, exceptId?: string) {
    for (const [id, s] of this.rows) if (s.userId === userId && id !== exceptId) this.rows.delete(id);
  }
}

export class InMemoryRoles extends RoleRepository {
  rows: CustomRole[] = [];
  async list(tenantId: string) {
    return structuredClone(this.rows.filter((r) => r.tenantId === tenantId));
  }
  async find(tenantId: string, id: string) {
    return structuredClone(this.rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null);
  }
  async create(role: CustomRole) {
    this.rows.push(structuredClone(role));
  }
  async save(role: CustomRole) {
    this.rows = this.rows.map((r) => (r.id === role.id && r.tenantId === role.tenantId ? structuredClone(role) : r));
  }
  async delete(tenantId: string, id: string) {
    this.rows = this.rows.filter((r) => !(r.tenantId === tenantId && r.id === id));
  }
}

export class InMemoryAuditLog extends AuditLog {
  rows: StoredAuditEvent[] = [];
  async append(event: StoredAuditEvent) {
    this.rows.push(structuredClone(event));
  }
  async list(tenantId: string, q: AuditQuery & { limit: number }) {
    return this.rows
      .filter((e) => e.tenantId === tenantId && (!q.before || e.at < q.before) && (!q.actor || e.actor?.userId === q.actor) && (!q.decision || e.decision === q.decision) && (!q.action || e.action.startsWith(q.action)))
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
      .slice(0, q.limit)
      .map(({ tenantId: _t, expiresAt: _e, ...event }) => event);
  }
}

/** The identity services wired to in-memory storage. */
export function identityFixture() {
  const users = new InMemoryUsers();
  const tenants = new InMemoryTenants();
  const memberships = new InMemoryMemberships();
  const sessions = new InMemorySessions();
  const customRoles = new InMemoryRoles();
  const auditLog = new InMemoryAuditLog();
  const access = new AccessService(sessions, users, memberships, customRoles);
  const auth = new AuthService(users, tenants, memberships, sessions, new SessionIssuer(sessions), access, new InMemoryRateLimiter());
  const roles = new RolesService(customRoles, memberships, access);
  const members = new MembersService(users, tenants, memberships, access, roles);
  const audit = new AuditService(auditLog);
  return { users, tenants, memberships, sessions, customRoles, auditLog, access, auth, roles, members, audit };
}
