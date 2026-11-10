import { identityFixture } from '../../../testing/identity-fakes';
import { ForbiddenError, InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import type { AuthContext } from '../../../shared/auth/auth.types';

describe('builder roles', () => {
  let f: ReturnType<typeof identityFixture>;
  let tenantId: string;
  let owner: AuthContext;

  const as = (userId: string, role: string): AuthContext => ({ userId, email: `${userId}@example.com`, sessionId: 's', tenantId, role });
  const support = {
    name: 'Support',
    description: 'Helps customers',
    policy: {
      statements: [
        { effect: 'allow', actions: ['shipments:*', 'executions:read', 'members:read'], resources: ['*'] },
        { effect: 'deny', actions: ['shipments:write'], resources: ['shipment:shp_vip*'], description: 'VIP shipments are hands-off' },
      ],
    },
  };

  beforeEach(async () => {
    f = identityFixture();
    const session = await f.auth.signup({ name: 'Owner', email: 'owner@example.com', password: 'a-long-password', workspaceName: 'Acme' });
    tenantId = session.memberships[0].tenantId;
    owner = as(session.user.id, 'owner');
  });

  it('lists the built-in roles first, then custom ones, with how many members have each', async () => {
    const role = await f.roles.create(tenantId, support, owner);
    await f.members.add(tenantId, { email: 'sam@example.com', role: role.id }, owner);
    const roles = await f.roles.list(tenantId);
    expect(roles.map((r) => [r.id, r.name, r.builtIn, r.memberCount])).toEqual([
      ['owner', 'Owner', true, 1],
      ['editor', 'Editor', true, 0],
      ['viewer', 'Viewer', true, 0],
      [role.id, 'Support', false, 1],
    ]);
    expect(role.id).toMatch(/^role_/);
    expect(roles[3].policy.statements[1]).toEqual({ effect: 'deny', actions: ['shipments:write'], resources: ['shipment:shp_vip*'], description: 'VIP shipments are hands-off' });
  });

  it('explains what is wrong with a role', async () => {
    const issues = await f.roles
      .create(tenantId, {
        name: 'owner',
        policy: { statements: [{ effect: 'allow', actions: ['orders:read'], resources: ['shipments'], roles: ['admin'], when: [{ left: 1, op: 'eq', right: 1 }] }] },
      }, owner)
      .catch((e: ValidationFailedError) => e.issues.map((i) => `${i.field}: ${i.message}`));
    expect(issues).toEqual([
      'name: A role named “owner” already exists',
      'policy: Statement 1: leave out roles — a builder role applies to the members who have it',
      "policy: Statement 1: conditions (when) aren't supported in builder roles",
      'policy: Statement 1: “orders:read” matches no permission — e.g. workflows:publish, workflows:*, *:read',
      expect.stringContaining('policy: Statement 1: “shipments” should look like workflow:* or workflow:wf_123'),
    ]);
    await expect(f.roles.create(tenantId, { name: 'Empty', policy: { statements: [] } }, owner)).rejects.toThrow('Add at least one statement');
  });

  it('keeps built-in roles fixed and roles in use assigned', async () => {
    await expect(f.roles.update(tenantId, 'editor', { name: 'Builder' }, owner)).rejects.toThrow(InvalidOperationError);
    await expect(f.roles.delete(tenantId, 'viewer')).rejects.toThrow('Built-in roles can’t be changed');
    const role = await f.roles.create(tenantId, support, owner);
    const { member } = await f.members.add(tenantId, { email: 'sam@example.com', role: role.id }, owner);
    await expect(f.roles.delete(tenantId, role.id)).rejects.toThrow('1 member has this role — give them another role first');
    await f.members.changeRole(tenantId, member.userId, 'viewer', owner);
    await f.roles.delete(tenantId, role.id);
    await expect(f.roles.delete(tenantId, role.id)).rejects.toThrow(NotFoundError);
  });

  it('changes take effect at once for the members who have the role', async () => {
    const role = await f.roles.create(tenantId, support, owner);
    expect((await f.roles.simulate(tenantId, { action: 'workflows:read', roleId: role.id }, owner)).allowed).toBe(false);
    const updated = await f.roles.update(tenantId, role.id, { policy: { statements: [...support.policy.statements, { effect: 'allow', actions: ['workflows:read'], resources: ['*'] }] } }, owner);
    expect(updated).toMatchObject({ name: 'Support', description: 'Helps customers' });
    expect((await f.roles.simulate(tenantId, { action: 'workflows:read', roleId: role.id }, owner)).allowed).toBe(true);
  });

  it('simulates a decision for a role or a member, on all resources or one', async () => {
    const role = await f.roles.create(tenantId, support, owner);
    const { member } = await f.members.add(tenantId, { email: 'sam@example.com', role: role.id }, owner);
    expect(await f.roles.simulate(tenantId, { action: 'shipments:write', userId: member.userId }, owner)).toEqual({
      allowed: true,
      reason: 'Allowed by statement 1',
      statement: 0,
      action: 'shipments:write',
      resource: 'shipment:*',
      role: { id: role.id, name: 'Support' },
    });
    expect(await f.roles.simulate(tenantId, { action: 'shipments:write', resource: 'shipment:shp_vip_1', userId: member.userId }, owner)).toMatchObject({
      allowed: false,
      reason: 'Denied by “VIP shipments are hands-off”',
      statement: 1,
    });
    expect(await f.roles.simulate(tenantId, { action: 'audit:read', roleId: 'editor' }, owner)).toMatchObject({ allowed: false, reason: 'Denied by “Running the workspace is for owners”' });
    expect(await f.roles.simulate(tenantId, { action: 'audit:read' }, owner)).toMatchObject({ allowed: true, role: { id: 'owner', name: 'Owner' } });
    await expect(f.roles.simulate(tenantId, { action: 'orders:read' }, owner)).rejects.toThrow(ValidationFailedError);
    await expect(f.roles.simulate(tenantId, { action: 'workflows:read', userId: 'usr_nobody' }, owner)).rejects.toThrow(NotFoundError);
  });

  it('tells a member what their role allows', async () => {
    const viewer = await f.roles.mine(tenantId, as('usr_v', 'viewer'));
    expect(viewer.role).toEqual({ id: 'viewer', name: 'Viewer' });
    expect(viewer.allowed).toContain('workflows:read');
    expect(viewer.allowed).toContain('members:read');
    expect(viewer.allowed).not.toContain('workflows:write');
    expect(viewer.allowed).not.toContain('audit:read');
    const editor = await f.roles.mine(tenantId, as('usr_e', 'editor'));
    expect(editor.allowed).toEqual(expect.arrayContaining(['workflows:publish', 'shipments:run', 'events:emit', 'roles:read']));
    expect(editor.allowed).not.toEqual(expect.arrayContaining(['members:manage']));
    expect((await f.roles.mine(tenantId, owner)).allowed).toHaveLength(f.roles.catalog().areas.flatMap((a) => a.actions).length);
  });

  describe('no escalation', () => {
    let manager: AuthContext;

    beforeEach(async () => {
      // Can manage people and roles, and build workflows — but not the database or the audit log.
      const role = await f.roles.create(tenantId, {
        name: 'Team lead',
        policy: { statements: [{ effect: 'allow', actions: ['members:*', 'roles:*', 'workflows:*', '*:read'], resources: ['*'] }, { effect: 'deny', actions: ['audit:read'], resources: ['*'] }] },
      }, owner);
      const { member } = await f.members.add(tenantId, { email: 'lead@example.com', role: role.id }, owner);
      manager = as(member.userId, role.id);
    });

    it("can't hand out permissions they don't have", async () => {
      await expect(f.members.add(tenantId, { email: 'x@example.com', role: 'owner' }, manager)).rejects.toThrow(ForbiddenError);
      await expect(f.members.add(tenantId, { email: 'x@example.com', role: 'editor' }, manager)).rejects.toThrow(/can't give permissions you don't have yourself: .*endpoints:write/);
      await expect(f.roles.create(tenantId, { name: 'Auditor', policy: { statements: [{ effect: 'allow', actions: ['audit:read'], resources: ['*'] }] } }, manager)).rejects.toThrow(
        "You can't give permissions you don't have yourself: audit:read",
      );
      // A permission granted on a single resource still counts.
      await expect(f.roles.create(tenantId, { name: 'One endpoint', policy: { statements: [{ effect: 'allow', actions: ['endpoints:write'], resources: ['endpoint:ep_1'] }] } }, manager)).rejects.toThrow('endpoints:write');
      // Within their own permissions, fine.
      const reader = await f.roles.create(tenantId, { name: 'Workflow author', policy: { statements: [{ effect: 'allow', actions: ['workflows:*'], resources: ['*'] }] } }, manager);
      expect((await f.members.add(tenantId, { email: 'author@example.com', role: reader.id }, manager)).member).toMatchObject({ role: reader.id, roleName: 'Workflow author' });
    });

    it("can't change or remove someone with more access", async () => {
      const { member } = await f.members.add(tenantId, { email: 'ed@example.com', role: 'editor' }, owner);
      await expect(f.members.changeRole(tenantId, member.userId, 'viewer', manager)).rejects.toThrow("You can't change or remove someone who has permissions you don't");
      await expect(f.members.remove(tenantId, owner.userId, manager)).rejects.toThrow(ForbiddenError);
      const viewer = (await f.members.add(tenantId, { email: 'v@example.com', role: 'viewer' }, manager)).member;
      await f.members.remove(tenantId, viewer.userId, manager);
    });
  });

  it('members carry their role name; unknown roles are refused', async () => {
    const role = await f.roles.create(tenantId, support, owner);
    const { member } = await f.members.add(tenantId, { email: 'sam@example.com', role: role.id }, owner);
    expect((await f.members.list(tenantId)).map((m) => [m.email, m.role, m.roleName])).toEqual([
      ['owner@example.com', 'owner', 'Owner'],
      ['sam@example.com', role.id, 'Support'],
    ]);
    expect((await f.auth.me(member.userId)).memberships).toEqual([{ tenantId, tenantName: 'Acme', role: role.id, roleName: 'Support' }]);
    await expect(f.members.changeRole(tenantId, member.userId, 'role_missing', owner)).rejects.toThrow('Role “role_missing” doesn\'t exist in this workspace');
    await expect(f.members.add(tenantId, { email: 'z@example.com', role: 'superuser' }, owner)).rejects.toThrow(ValidationFailedError);
  });

  it("roles belong to one workspace", async () => {
    const role = await f.roles.create(tenantId, support, owner);
    const other = await f.auth.signup({ name: 'Other', email: 'other@example.com', password: 'a-long-password', workspaceName: 'Other' });
    const otherTenant = other.memberships[0].tenantId;
    await expect(f.members.add(otherTenant, { email: 'sam@example.com', role: role.id }, { ...owner, userId: other.user.id, tenantId: otherTenant })).rejects.toThrow("doesn't exist in this workspace");
    await expect(f.roles.update(otherTenant, role.id, { name: 'Mine now' }, owner)).rejects.toThrow(NotFoundError);
  });
});
