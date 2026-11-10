import { Injectable } from '@nestjs/common';
import { hashSecret } from '../../../shared/security/secrets';
import { MembershipRepository, RoleRepository, SessionRepository, UserRepository } from '../domain/identity.repository';
import { SESSION_PREFIX, SESSION_TOUCH_INTERVAL_MS } from '../domain/identity.constants';
import { MEMBERSHIP_CACHE_MS } from './access.service.constants';
import { ROLE_CACHE_MS } from '../domain/access.constants';
import { builtInRole } from '../domain/access';
import type { Membership, User } from '../domain/identity.types';
import type { RoleDefinition } from '../domain/access.types';

/**
 * What the auth guard asks on every control-plane request: who is this token, which role do they
 * have in this workspace, and what does that role allow. Memberships and custom roles are cached
 * briefly per process (changes take effect within MEMBERSHIP_CACHE_MS / ROLE_CACHE_MS on other
 * replicas; at once on the one that made them).
 */
@Injectable()
export class AccessService {
  private readonly memberships = new Map<string, { at: number; list: Membership[] }>();
  private readonly roles = new Map<string, { at: number; role: RoleDefinition | null }>();

  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly members: MembershipRepository,
    private readonly customRoles: RoleRepository,
  ) {}

  async authenticate(token: string): Promise<{ user: User; sessionId: string } | null> {
    if (!token.startsWith(SESSION_PREFIX)) return null;
    const session = await this.sessions.findByTokenHash(hashSecret(token));
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
    const user = await this.users.findById(session.userId);
    if (!user) return null;
    if (Date.now() - Date.parse(session.lastUsedAt) > SESSION_TOUCH_INTERVAL_MS) await this.sessions.touch(session.id, new Date().toISOString());
    return { user, sessionId: session.id };
  }

  /** The member's role id in the workspace, or null when they aren't a member. */
  async roleIn(userId: string, tenantId: string): Promise<string | null> {
    const cached = this.memberships.get(userId);
    const list = cached && Date.now() - cached.at < MEMBERSHIP_CACHE_MS ? cached.list : await this.load(userId);
    return list.find((m) => m.tenantId === tenantId)?.role ?? null;
  }

  /** A built-in role, or the workspace's custom role with that id (null when it doesn't exist). */
  async role(tenantId: string, roleId: string): Promise<RoleDefinition | null> {
    const builtIn = builtInRole(roleId);
    if (builtIn) return builtIn;
    const key = `${tenantId}:${roleId}`;
    const cached = this.roles.get(key);
    if (cached && Date.now() - cached.at < ROLE_CACHE_MS) return cached.role;
    const stored = await this.customRoles.find(tenantId, roleId);
    const role = stored ? { id: stored.id, name: stored.name, description: stored.description, builtIn: false, policy: stored.policy } : null;
    this.roles.set(key, { at: Date.now(), role });
    return role;
  }

  /** Drop cached memberships after they change. */
  forget(userId: string) {
    this.memberships.delete(userId);
  }

  /** Drop a cached custom role after it changes. */
  forgetRole(tenantId: string, roleId: string) {
    this.roles.delete(`${tenantId}:${roleId}`);
  }

  private async load(userId: string) {
    const list = await this.members.forUser(userId);
    this.memberships.set(userId, { at: Date.now(), list });
    return list;
  }
}
