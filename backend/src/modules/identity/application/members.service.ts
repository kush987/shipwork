import { Injectable } from '@nestjs/common';
import { InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { uniq } from 'lodash';
import { newId } from '../../../shared/domain/id';
import { hashPassword } from '../../../shared/security/passwords';
import { MembershipRepository, TenantRepository, UserRepository } from '../domain/identity.repository';
import { emailIssue, normalizeEmail } from '../domain/identity';
import { AccessService } from './access.service';
import { RolesService } from './roles.service';
import { nameFromEmail, temporaryPassword } from './identity.helpers';
import type { MemberView, Membership, User } from '../domain/identity.types';
import type { RoleDefinition } from '../domain/access.types';
import type { AuthContext } from '../../../shared/auth/auth.types';
import type { AddMemberInput, WorkspaceOwnerInput } from './identity.service.types';

const toMember = (m: Membership, user: User, roleName: string): MemberView => ({ userId: user.id, name: user.name, email: user.email, role: m.role, roleName, createdAt: m.createdAt });

/**
 * Who belongs to a workspace and with which role (built-in or custom). Every workspace keeps at
 * least one owner, and nobody can hand out — or take away — more access than they have themselves.
 * `by` is the member making the change; internal callers (scripts, sign-up) leave it out.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly users: UserRepository,
    private readonly tenants: TenantRepository,
    private readonly members: MembershipRepository,
    private readonly access: AccessService,
    private readonly roles: RolesService,
  ) {}

  async list(tenantId: string): Promise<MemberView[]> {
    const memberships = await this.members.forTenant(tenantId);
    const users = new Map((await this.users.findByIds(memberships.map((m) => m.userId))).map((u) => [u.id, u]));
    const names = await this.roleNames(tenantId, memberships.map((m) => m.role));
    return memberships.filter((m) => users.has(m.userId)).map((m) => toMember(m, users.get(m.userId)!, names.get(m.role)!));
  }

  /**
   * Adds someone by email. Without an account yet, one is created with a temporary password,
   * returned once for the owner to pass on (there is no email delivery).
   */
  async add(tenantId: string, input: AddMemberInput, by?: AuthContext): Promise<{ member: MemberView; temporaryPassword?: string }> {
    const email = normalizeEmail(input.email ?? '');
    const role = await this.access.role(tenantId, input.role ?? '');
    const issues = [emailIssue(email), role ? null : `Role “${input.role}” doesn't exist in this workspace`].filter((i): i is string => !!i);
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
    if (by) await this.roles.assertNoEscalation(tenantId, role!.policy, by);

    let user = await this.users.findByEmail(email);
    let password: string | undefined;
    if (user && (await this.members.find(user.id, tenantId))) throw new InvalidOperationError(`${email} is already a member`);
    if (!user) {
      password = temporaryPassword();
      const now = new Date().toISOString();
      user = { id: newId('usr'), name: input.name?.trim() || nameFromEmail(email), email, passwordHash: await hashPassword(password), createdAt: now, updatedAt: now };
      await this.users.create(user);
    }
    const membership: Membership = { userId: user.id, tenantId, role: role!.id, createdAt: new Date().toISOString() };
    await this.members.add(membership);
    this.access.forget(user.id);
    return { member: toMember(membership, user, role!.name), ...(password ? { temporaryPassword: password } : {}) };
  }

  async changeRole(tenantId: string, userId: string, roleId: string, by?: AuthContext): Promise<MemberView> {
    const role = await this.access.role(tenantId, roleId ?? '');
    if (!role) throw new ValidationFailedError([{ field: 'role', message: `Role “${roleId}” doesn't exist in this workspace` }]);
    const membership = await this.require(tenantId, userId);
    if (by) {
      await this.assertOutranks(tenantId, membership, by);
      await this.roles.assertNoEscalation(tenantId, role.policy, by);
    }
    if (membership.role === 'owner' && role.id !== 'owner') await this.keepAnOwner(tenantId);
    await this.members.setRole(userId, tenantId, role.id);
    this.access.forget(userId);
    return toMember({ ...membership, role: role.id }, (await this.users.findById(userId))!, role.name);
  }

  async remove(tenantId: string, userId: string, by?: AuthContext): Promise<void> {
    const membership = await this.require(tenantId, userId);
    if (by) await this.assertOutranks(tenantId, membership, by);
    if (membership.role === 'owner') await this.keepAnOwner(tenantId);
    await this.members.remove(userId, tenantId);
    this.access.forget(userId);
  }

  /**
   * Gives an existing workspace (e.g. data from before accounts existed) an owner. Idempotent:
   * creates whatever is missing, never changes an existing password.
   */
  async ensureWorkspaceOwner(input: WorkspaceOwnerInput): Promise<{ created: string[] }> {
    const created: string[] = [];
    const now = new Date().toISOString();
    if (!(await this.tenants.findById(input.tenantId))) {
      await this.tenants.create({ id: input.tenantId, name: input.tenantName, createdAt: now });
      created.push(`workspace ${input.tenantId}`);
    }
    const email = normalizeEmail(input.email);
    let user = await this.users.findByEmail(email);
    if (!user) {
      user = { id: newId('usr'), name: input.name, email, passwordHash: await hashPassword(input.password), createdAt: now, updatedAt: now };
      await this.users.create(user);
      created.push(`user ${email}`);
    }
    const membership = await this.members.find(user.id, input.tenantId);
    if (!membership) {
      await this.members.add({ userId: user.id, tenantId: input.tenantId, role: 'owner', createdAt: now });
      created.push(`owner membership`);
    } else if (membership.role !== 'owner') {
      await this.members.setRole(user.id, input.tenantId, 'owner');
      created.push(`owner role`);
    }
    return { created };
  }

  private async require(tenantId: string, userId: string) {
    const membership = await this.members.find(userId, tenantId);
    if (!membership) throw new NotFoundError('Member', userId);
    return membership;
  }

  /** Names for role ids; a custom role deleted under a member shows its id. */
  private async roleNames(tenantId: string, roleIds: string[]) {
    const roles = await Promise.all(uniq(roleIds).map((id) => this.access.role(tenantId, id).then((r) => [id, r?.name ?? id] as const)));
    return new Map(roles);
  }

  /** Changing or removing someone needs at least their access (an editor-level role can't remove an owner). */
  private async assertOutranks(tenantId: string, membership: Membership, by: AuthContext) {
    const current: RoleDefinition | null = await this.access.role(tenantId, membership.role);
    if (current) await this.roles.assertNoEscalation(tenantId, current.policy, by, "You can't change or remove someone who has permissions you don't");
  }

  private async keepAnOwner(tenantId: string) {
    const owners = (await this.members.forTenant(tenantId)).filter((m) => m.role === 'owner');
    if (owners.length <= 1) throw new InvalidOperationError('A workspace needs at least one owner — make someone else owner first');
  }
}
