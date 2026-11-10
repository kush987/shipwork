import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { identityFixture } from '../../../testing/identity-fakes';
import { ForbiddenError, UnauthenticatedError } from '../../../shared/domain/errors';
import { ANY_MEMBER, AREA, IS_PUBLIC, NO_TENANT, OPS_ONLY, PERMISSION, PLATFORM_ADMIN_WRITES } from '../../../shared/auth/auth.constants';
import { config } from '../../../config/configuration';
import type { AuthenticatedRequest } from '../../../shared/auth/auth.types';

type Meta = Partial<Record<string, unknown>>;

const context = (req: Record<string, unknown>, meta: Meta = {}) => {
  const handler = () => undefined;
  Reflect.defineMetadata('meta', meta, handler);
  return {
    ctx: {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
    meta,
  };
};

const request = (method: string, headers: Record<string, string>, params: Record<string, string> = {}) =>
  ({ method, headers, params, originalUrl: '/api/test?x=1', ip: '1.1.1.1', header: (name: string) => headers[name.toLowerCase()] }) as unknown as AuthenticatedRequest & Record<string, unknown>;

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('AuthGuard', () => {
  let f: ReturnType<typeof identityFixture>;
  let guard: AuthGuard;
  let meta: Meta;
  let owner: { token: string; tenantId: string; userId: string };
  let viewerToken: string;
  let editorToken: string;

  const signIn = async (email: string, role: string) => {
    const { temporaryPassword } = await f.members.add(owner.tenantId, { email, role });
    return (await f.auth.login({ email, password: temporaryPassword! }, '1.1.1.1')).token;
  };

  beforeEach(async () => {
    f = identityFixture();
    meta = {};
    const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
    guard = new AuthGuard(reflector, f.access, f.audit);
    const session = await f.auth.signup({ name: 'Owner', email: 'owner@example.com', password: 'a-long-password', workspaceName: 'Acme' });
    owner = { token: session.token, tenantId: session.memberships[0].tenantId, userId: session.user.id };
    viewerToken = await signIn('viewer@example.com', 'viewer');
    editorToken = await signIn('editor@example.com', 'editor');
  });

  const check = (method: string, headers: Record<string, string>, routeMeta: Meta = {}, params: Record<string, string> = {}) => {
    meta = routeMeta;
    const req = request(method, headers, params);
    return guard.canActivate(context(req).ctx).then((ok) => ({ ok, auth: req.auth, access: req.access }));
  };
  const as = (token: string, tenant: string) => ({ authorization: `Bearer ${token}`, 'x-tenant-id': tenant });
  const workflows = { [AREA]: 'workflows' };

  it('lets public routes through without a session', async () => {
    expect((await check('POST', {}, { [IS_PUBLIC]: true })).ok).toBe(true);
  });

  it('needs a valid session everywhere else', async () => {
    await expect(check('GET', { 'x-tenant-id': owner.tenantId }, workflows)).rejects.toThrow(UnauthenticatedError);
    await expect(check('GET', as('sfs_forged', owner.tenantId), workflows)).rejects.toThrow('session has expired');
  });

  it('only trusts x-tenant-id for workspaces the user belongs to', async () => {
    await expect(check('GET', as(owner.token, 'demo'), workflows)).rejects.toThrow('not a member of workspace “demo”');
    const { auth } = await check('GET', as(owner.token, owner.tenantId), workflows);
    expect(auth).toMatchObject({ email: 'owner@example.com', tenantId: owner.tenantId, role: 'owner', roleName: 'Owner' });
  });

  it('checks <area>:read for reads and <area>:write for changes, on the resource in the path', async () => {
    const read = await check('GET', as(viewerToken, owner.tenantId), workflows, { id: 'wf_1' });
    expect(read.access).toEqual({ action: 'workflows:read', resource: 'workflow:wf_1' });
    await expect(check('POST', as(viewerToken, owner.tenantId), workflows)).rejects.toThrow("Your role (Viewer) can't change workflows (workflows:write on workflow:*)");
    expect((await check('POST', as(editorToken, owner.tenantId), workflows)).access).toEqual({ action: 'workflows:write', resource: 'workflow:*' });
  });

  it('uses the permission a route names, with the resource of that permission', async () => {
    const publish = { ...workflows, [PERMISSION]: { action: 'workflows:publish' } };
    await expect(check('POST', as(viewerToken, owner.tenantId), publish, { id: 'wf_9' })).rejects.toThrow('(workflows:publish on workflow:wf_9)');
    // A route in another area naming a permission: the resource follows the permission (shipment:…).
    const run = { [AREA]: 'executions', [PERMISSION]: { action: 'shipments:run' } };
    expect((await check('POST', as(editorToken, owner.tenantId), run, { id: 'shp_1' })).access).toEqual({ action: 'shipments:run', resource: 'shipment:shp_1' });
    // Collections are named by :name, members by :userId.
    expect((await check('GET', as(viewerToken, owner.tenantId), { [AREA]: 'data' }, { name: 'orders', id: 'rec_1' })).access!.resource).toBe('collection:orders');
  });

  it('keeps the old built-in behaviour: editors build, owners run the workspace', async () => {
    const manage = { [AREA]: 'members', [PERMISSION]: { action: 'members:manage' } };
    await expect(check('POST', as(editorToken, owner.tenantId), manage)).rejects.toThrow("Your role (Editor) can't manage members");
    expect((await check('POST', as(owner.token, owner.tenantId), manage)).ok).toBe(true);
    expect((await check('GET', as(viewerToken, owner.tenantId), { [AREA]: 'members' })).ok).toBe(true);
    await expect(check('GET', as(editorToken, owner.tenantId), { [AREA]: 'audit' })).rejects.toThrow("can't view audit log");
  });

  it('applies custom roles, where a deny on some resources wins over a broad allow', async () => {
    const role = await f.roles.create(owner.tenantId, {
      name: 'Release manager',
      policy: {
        statements: [
          { effect: 'allow', actions: ['workflows:*', '*:read'], resources: ['*'] },
          { effect: 'deny', actions: ['workflows:publish'], resources: ['workflow:wf_prod*'], description: 'production is frozen' },
        ],
      },
    }, { userId: owner.userId, email: 'owner@example.com', sessionId: 's', tenantId: owner.tenantId, role: 'owner' });
    const token = await signIn('release@example.com', role.id);
    const publish = { ...workflows, [PERMISSION]: { action: 'workflows:publish' } };
    expect((await check('POST', as(token, owner.tenantId), publish, { id: 'wf_dev' })).auth).toMatchObject({ role: role.id, roleName: 'Release manager' });
    await expect(check('POST', as(token, owner.tenantId), publish, { id: 'wf_prod_orders' })).rejects.toThrow("Your role (Release manager) can't publish workflows");
    await expect(check('POST', as(token, owner.tenantId), { [AREA]: 'endpoints' })).rejects.toThrow(ForbiddenError);
  });

  it('records denied attempts in the workspace audit log, without the query string', async () => {
    await expect(check('DELETE', as(viewerToken, owner.tenantId), workflows, { id: 'wf_1' })).rejects.toThrow(ForbiddenError);
    await settle();
    expect(f.auditLog.rows).toEqual([
      expect.objectContaining({
        tenantId: owner.tenantId,
        actor: { userId: expect.any(String), email: 'viewer@example.com' },
        action: 'workflows:write',
        resource: 'workflow:wf_1',
        method: 'DELETE',
        path: '/api/test',
        decision: 'denied',
        status: 403,
        reason: 'No statement allows workflows:write on workflow:wf_1',
      }),
    ]);
  });

  it('fails closed on a workspace route that declares no permission', async () => {
    await expect(check('GET', as(owner.token, owner.tenantId))).rejects.toThrow('no permission set up');
  });

  it('any-member routes need membership only', async () => {
    expect((await check('GET', as(viewerToken, owner.tenantId), { [ANY_MEMBER]: true })).auth).toMatchObject({ role: 'viewer' });
    await expect(check('GET', as(viewerToken, 'demo'), { [ANY_MEMBER]: true })).rejects.toThrow('not a member');
  });

  it('a member whose role no longer exists can do nothing', async () => {
    const token = await signIn('support@example.com', 'viewer');
    const userId = (await f.users.findByEmail('support@example.com'))!.id;
    await f.memberships.setRole(userId, owner.tenantId, 'role_gone');
    f.access.forget(userId);
    await expect(check('GET', as(token, owner.tenantId), workflows)).rejects.toThrow('Your role (role_gone) no longer exists');
  });

  it('account routes need a session but no workspace', async () => {
    const { auth } = await check('GET', { authorization: `Bearer ${viewerToken}` }, { [NO_TENANT]: true });
    expect(auth).toMatchObject({ email: 'viewer@example.com' });
    expect(auth!.tenantId).toBeUndefined();
  });

  it('platform-wide settings: members read, platform admins change', async () => {
    const routeMeta = { [PLATFORM_ADMIN_WRITES]: true, [AREA]: 'couriers' };
    expect((await check('GET', as(owner.token, owner.tenantId), routeMeta)).ok).toBe(true);
    await expect(check('PATCH', as(owner.token, owner.tenantId), routeMeta)).rejects.toThrow(ForbiddenError);
    config.auth.platformAdmins.push('owner@example.com');
    try {
      expect((await check('PATCH', as(owner.token, owner.tenantId), routeMeta)).ok).toBe(true);
    } finally {
      config.auth.platformAdmins.pop();
    }
  });

  it('ops data: the ops token or a platform admin', async () => {
    const routeMeta = { [OPS_ONLY]: true };
    await expect(check('GET', { 'x-ops-token': 'guess' }, routeMeta)).rejects.toThrow(UnauthenticatedError);
    (config.auth as { opsToken: string }).opsToken = 'ops-secret-value';
    try {
      expect((await check('GET', { 'x-ops-token': 'ops-secret-value' }, routeMeta)).ok).toBe(true);
      await expect(check('GET', { authorization: `Bearer ${owner.token}` }, routeMeta)).rejects.toThrow('Only platform administrators');
    } finally {
      (config.auth as { opsToken: string }).opsToken = '';
    }
  });
});
