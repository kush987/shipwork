import { Injectable } from '@nestjs/common';
import { countBy } from 'lodash';
import { ForbiddenError, InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { MembershipRepository, RoleRepository } from '../domain/identity.repository';
import { ACCESS_CATALOG, ALL_ACTIONS, BUILT_IN_ROLES, CUSTOM_ROLE_PREFIX, MAX_CUSTOM_ROLES, MAX_ROLE_DESCRIPTION_LENGTH, MAX_ROLE_NAME_LENGTH } from '../domain/access.constants';
import { allowedActions, anyResourceOf, beyond, builderPolicy, builtInRole, decide } from '../domain/access';
import { AccessService } from './access.service';
import type { AuthContext } from '../../../shared/auth/auth.types';
import type { CustomRole, MyAccess, RoleDefinition, RoleInput, RoleView, SimulationInput, SimulationResult } from '../domain/access.types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Builder roles: the built-in owner/editor/viewer plus roles a workspace defines with the same policy
 * language its apps use. Nobody can hand out more than they have themselves (no escalation).
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RoleRepository,
    private readonly members: MembershipRepository,
    private readonly access: AccessService,
  ) {}

  catalog() {
    return { areas: ACCESS_CATALOG };
  }

  async list(tenantId: string): Promise<RoleView[]> {
    const [custom, memberships] = await Promise.all([this.roles.list(tenantId), this.members.forTenant(tenantId)]);
    const counts = countBy(memberships, 'role');
    return [
      ...BUILT_IN_ROLES.map((r) => ({ ...r, memberCount: counts[r.id] ?? 0, createdAt: null, updatedAt: null })),
      ...custom.map((r) => this.toView(r, counts[r.id] ?? 0)),
    ];
  }

  async create(tenantId: string, input: RoleInput, by: AuthContext): Promise<RoleView> {
    const existing = await this.roles.list(tenantId);
    if (existing.length >= MAX_CUSTOM_ROLES) throw new InvalidOperationError(`A workspace can have at most ${MAX_CUSTOM_ROLES} custom roles`);
    const { name, description, policy } = this.validate(input, existing);
    await this.assertNoEscalation(tenantId, policy, by);
    const now = new Date().toISOString();
    const role: CustomRole = { id: newId(CUSTOM_ROLE_PREFIX), tenantId, name, description, policy, createdAt: now, updatedAt: now };
    await this.roles.create(role);
    return this.toView(role, 0);
  }

  async update(tenantId: string, id: string, input: RoleInput, by: AuthContext): Promise<RoleView> {
    const role = await this.requireCustom(tenantId, id);
    const { name, description, policy } = this.validate({ name: role.name, description: role.description, policy: role.policy, ...input }, (await this.roles.list(tenantId)).filter((r) => r.id !== id));
    await this.assertNoEscalation(tenantId, policy, by);
    const updated: CustomRole = { ...role, name, description, policy, updatedAt: new Date().toISOString() };
    await this.roles.save(updated);
    this.access.forgetRole(tenantId, id);
    return this.toView(updated, await this.memberCount(tenantId, id));
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.requireCustom(tenantId, id);
    const assigned = await this.memberCount(tenantId, id);
    if (assigned) throw new InvalidOperationError(`${plural(assigned, 'member')} ${assigned === 1 ? 'has' : 'have'} this role — give them another role first`);
    await this.roles.delete(tenantId, id);
    this.access.forgetRole(tenantId, id);
  }

  /** Would this member (or role) be allowed to do this? The same decision the guard makes. */
  async simulate(tenantId: string, input: SimulationInput, by: AuthContext): Promise<SimulationResult> {
    const action = input.action?.trim() ?? '';
    if (!ALL_ACTIONS.includes(action)) throw new ValidationFailedError([{ field: 'action', message: `Choose a permission, e.g. workflows:publish` }]);
    const resource = input.resource?.trim() || anyResourceOf(action);
    const role = await this.roleToSimulate(tenantId, input, by);
    return { ...decide(role.policy, action, resource), action, resource, role: { id: role.id, name: role.name } };
  }

  async mine(tenantId: string, by: AuthContext): Promise<MyAccess> {
    const role = await this.access.role(tenantId, by.role ?? '');
    return { role: { id: by.role ?? '', name: role?.name ?? by.role ?? '' }, allowed: role ? allowedActions(role.policy) : [] };
  }

  /**
   * Refuses to let someone hand out permissions they don't have themselves (a custom role with
   * members:manage can't make anyone owner; one with roles:manage can't write itself a bigger role).
   */
  async assertNoEscalation(tenantId: string, target: RoleDefinition['policy'], by: AuthContext, message = "You can't give permissions you don't have yourself") {
    const own = await this.access.role(tenantId, by.role ?? '');
    const extra = own ? beyond(target, own.policy) : ALL_ACTIONS;
    if (extra.length) throw new ForbiddenError(`${message}: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ` and ${extra.length - 5} more` : ''}`);
  }

  private async roleToSimulate(tenantId: string, input: SimulationInput, by: AuthContext): Promise<RoleDefinition> {
    if (input.userId) {
      const membership = await this.members.find(input.userId, tenantId);
      if (!membership) throw new NotFoundError('Member', input.userId);
      return (await this.access.role(tenantId, membership.role)) ?? { id: membership.role, name: membership.role, description: '', builtIn: false, policy: { statements: [] } };
    }
    const roleId = input.roleId || by.role || '';
    const role = await this.access.role(tenantId, roleId);
    if (!role) throw new NotFoundError('Role', roleId);
    return role;
  }

  private validate(input: RoleInput, others: CustomRole[]) {
    const name = input.name?.trim() ?? '';
    const description = input.description?.trim() ?? '';
    const issues: { field: string; message: string }[] = [];
    if (!name) issues.push({ field: 'name', message: 'Give the role a name' });
    else if (name.length > MAX_ROLE_NAME_LENGTH) issues.push({ field: 'name', message: `Name must be at most ${MAX_ROLE_NAME_LENGTH} characters` });
    else if ([...BUILT_IN_ROLES, ...others].some((r) => r.name.toLowerCase() === name.toLowerCase())) issues.push({ field: 'name', message: `A role named “${name}” already exists` });
    if (description.length > MAX_ROLE_DESCRIPTION_LENGTH) issues.push({ field: 'description', message: `Description must be at most ${MAX_ROLE_DESCRIPTION_LENGTH} characters` });
    const { issues: policyIssues, policy } = builderPolicy(input.policy);
    issues.push(...policyIssues.map((message) => ({ field: 'policy', message })));
    if (issues.length) throw new ValidationFailedError(issues);
    return { name, description, policy };
  }

  private async requireCustom(tenantId: string, id: string): Promise<CustomRole> {
    if (builtInRole(id)) throw new InvalidOperationError('Built-in roles can’t be changed — create a custom role instead');
    const role = await this.roles.find(tenantId, id);
    if (!role) throw new NotFoundError('Role', id);
    return role;
  }

  private async memberCount(tenantId: string, roleId: string) {
    return (await this.members.forTenant(tenantId)).filter((m) => m.role === roleId).length;
  }

  private toView(role: CustomRole, memberCount: number): RoleView {
    const { id, name, description, policy, createdAt, updatedAt } = role;
    return { id, name, description, builtIn: false, policy, memberCount, createdAt, updatedAt };
  }
}
