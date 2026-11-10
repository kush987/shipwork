import { identityFixture } from '../../../testing/identity-fakes';
import { ForbiddenError, InvalidOperationError, TooManyRequestsError, ValidationFailedError } from '../../../shared/domain/errors';
import { config } from '../../../config/configuration';

const signupInput = { name: 'Asha', email: 'Asha@Example.com ', password: 'a-long-password', workspaceName: 'Acme Logistics' };

describe('identity', () => {
  let f: ReturnType<typeof identityFixture>;
  beforeEach(() => (f = identityFixture()));

  describe('sign-up and sign-in', () => {
    it('creates the account, an owned workspace with a fresh id, and a session', async () => {
      const session = await f.auth.signup(signupInput);
      expect(session.token).toMatch(/^sfs_/);
      expect(session.user).toEqual({ id: expect.stringMatching(/^usr_/), name: 'Asha', email: 'asha@example.com', createdAt: expect.any(String), platformAdmin: false });
      expect(session.memberships).toEqual([{ tenantId: expect.stringMatching(/^acme-logistics-[0-9a-f]{6}$/), tenantName: 'Acme Logistics', role: 'owner', roleName: 'Owner' }]);
      expect(JSON.stringify([...f.users.rows.values()])).not.toContain('a-long-password');
      expect([...f.sessions.rows.values()][0].tokenHash).not.toBe(session.token);
    });

    it('never gives a new workspace the id of existing data (e.g. "demo")', async () => {
      const session = await f.auth.signup({ ...signupInput, workspaceName: 'demo' });
      expect(session.memberships[0].tenantId).not.toBe('demo');
    });

    it('rejects bad input, a taken email, and sign-up when it is turned off', async () => {
      await expect(f.auth.signup({ ...signupInput, password: 'short', email: 'nope' })).rejects.toThrow(ValidationFailedError);
      await f.auth.signup(signupInput);
      await expect(f.auth.signup(signupInput)).rejects.toThrow(InvalidOperationError);
      const before = config.auth.allowSignup;
      (config.auth as { allowSignup: boolean }).allowSignup = false;
      try {
        await expect(f.auth.signup({ ...signupInput, email: 'b@example.com' })).rejects.toThrow(ForbiddenError);
      } finally {
        (config.auth as { allowSignup: boolean }).allowSignup = before;
      }
    });

    it('signs in with the right password only, with the same message for unknown emails', async () => {
      await f.auth.signup(signupInput);
      expect((await f.auth.login({ email: 'ASHA@example.com', password: 'a-long-password' }, '1.1.1.1')).user.email).toBe('asha@example.com');
      await expect(f.auth.login({ email: 'asha@example.com', password: 'wrong-password' }, '1.1.1.1')).rejects.toThrow('Invalid email or password');
      await expect(f.auth.login({ email: 'ghost@example.com', password: 'whatever-pass' }, '1.1.1.1')).rejects.toThrow('Invalid email or password');
    });

    it('slows down password guessing per email', async () => {
      await f.auth.signup(signupInput);
      for (let i = 0; i < 10; i++) await f.auth.login({ email: 'asha@example.com', password: 'wrong-password' }, `10.0.0.${i}`).catch(() => undefined);
      const error = await f.auth.login({ email: 'asha@example.com', password: 'a-long-password' }, '10.0.0.99').catch((e) => e);
      expect(error).toBeInstanceOf(TooManyRequestsError);
      expect(error.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('authenticates tokens until sign-out; changing the password ends the other sessions', async () => {
      const first = await f.auth.signup(signupInput);
      const second = await f.auth.login({ email: 'asha@example.com', password: 'a-long-password' }, '1.1.1.1');
      const a = (await f.access.authenticate(first.token))!;
      expect(a.user.email).toBe('asha@example.com');
      expect(await f.access.authenticate('sfs_not-a-real-token')).toBeNull();
      expect(await f.access.authenticate('sk_api-key-looking')).toBeNull();

      await f.auth.changePassword(a.user.id, a.sessionId, 'a-long-password', 'another-long-password');
      expect(await f.access.authenticate(first.token)).not.toBeNull();
      expect(await f.access.authenticate(second.token)).toBeNull();
      await expect(f.auth.changePassword(a.user.id, a.sessionId, 'wrong', 'x-long-password')).rejects.toThrow(ValidationFailedError);

      await f.auth.logout(a.sessionId);
      expect(await f.access.authenticate(first.token)).toBeNull();
    });

    it('treats expired sessions as signed out', async () => {
      const session = await f.auth.signup(signupInput);
      [...f.sessions.rows.values()][0].expiresAt = new Date(Date.now() - 1000).toISOString();
      expect(await f.access.authenticate(session.token)).toBeNull();
    });
  });

  describe('members', () => {
    const setup = async () => {
      const owner = await f.auth.signup(signupInput);
      return { owner, tenantId: owner.memberships[0].tenantId, ownerId: owner.user.id };
    };

    it('adds an existing account, or creates one with a one-time password', async () => {
      const { tenantId } = await setup();
      await f.auth.signup({ ...signupInput, email: 'ravi@example.com', name: 'Ravi', workspaceName: 'Ravi Co' });
      const existing = await f.members.add(tenantId, { email: 'RAVI@example.com', role: 'editor' });
      expect(existing).toEqual({ member: expect.objectContaining({ email: 'ravi@example.com', role: 'editor' }) });

      const created = await f.members.add(tenantId, { email: 'new.person@example.com', role: 'viewer' });
      expect(created.member).toMatchObject({ name: 'new.person', role: 'viewer' });
      expect(created.temporaryPassword).toHaveLength(16);
      expect((await f.auth.login({ email: 'new.person@example.com', password: created.temporaryPassword! }, '1.1.1.1')).memberships).toEqual([
        { tenantId, tenantName: 'Acme Logistics', role: 'viewer', roleName: 'Viewer' },
      ]);
      await expect(f.members.add(tenantId, { email: 'ravi@example.com', role: 'viewer' })).rejects.toThrow('already a member');
      expect((await f.members.list(tenantId)).map((m) => m.role)).toEqual(['owner', 'editor', 'viewer']);
    });

    it('always keeps an owner', async () => {
      const { tenantId, ownerId } = await setup();
      await expect(f.members.changeRole(tenantId, ownerId, 'editor')).rejects.toThrow('at least one owner');
      await expect(f.members.remove(tenantId, ownerId)).rejects.toThrow('at least one owner');
      const { member } = await f.members.add(tenantId, { email: 'second@example.com', role: 'owner' });
      await f.members.changeRole(tenantId, ownerId, 'editor');
      expect(await f.access.roleIn(ownerId, tenantId)).toBe('editor');
      // The second person is now the only owner: they stay.
      await expect(f.members.remove(tenantId, member.userId)).rejects.toThrow('at least one owner');
      await f.members.remove(tenantId, ownerId);
      expect(await f.access.roleIn(ownerId, tenantId)).toBeNull();
    });

    it('gives an existing workspace (data from before accounts) an owner, idempotently', async () => {
      const input = { tenantId: 'demo', tenantName: 'Demo Logistics', email: 'Owner@Example.com', name: 'Owner', password: 'demo-owner-password' };
      expect(await f.members.ensureWorkspaceOwner(input)).toEqual({ created: ['workspace demo', 'user owner@example.com', 'owner membership'] });
      expect(await f.members.ensureWorkspaceOwner({ ...input, password: 'something-else-entirely' })).toEqual({ created: [] });
      const session = await f.auth.login({ email: 'owner@example.com', password: 'demo-owner-password' }, '1.1.1.1');
      expect(session.memberships).toEqual([{ tenantId: 'demo', tenantName: 'Demo Logistics', role: 'owner', roleName: 'Owner' }]);
    });
  });
});
