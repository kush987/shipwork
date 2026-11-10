import { Injectable } from '@nestjs/common';
import { ForbiddenError, InvalidOperationError, TooManyRequestsError, UnauthenticatedError, ValidationFailedError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { hashPassword, verifyPassword } from '../../../shared/security/passwords';
import { RateLimiter } from '../../../shared/rate-limit/rate-limit.ports';
import { config } from '../../../config/configuration';
import { MembershipRepository, SessionRepository, TenantRepository, UserRepository } from '../domain/identity.repository';
import { LOGIN_ATTEMPTS_PER_EMAIL, LOGIN_ATTEMPTS_PER_IP } from '../domain/identity.constants';
import { emailIssue, normalizeEmail, passwordIssue, toUserView } from '../domain/identity';
import { SessionIssuer } from './session-issuer';
import { AccessService } from './access.service';
import { newTenantId } from './identity.helpers';
import { LOGIN_WINDOW_MS } from './auth.service.constants';
import type { AuthSession, MembershipView, User } from '../domain/identity.types';
import type { LoginInput, SignupInput } from './identity.service.types';

@Injectable()
export class AuthService {
  /** Compared against when the email is unknown, so both failures take the same time. */
  private readonly decoyHash = hashPassword('decoy-password-for-timing');

  constructor(
    private readonly users: UserRepository,
    private readonly tenants: TenantRepository,
    private readonly members: MembershipRepository,
    private readonly sessions: SessionRepository,
    private readonly issuer: SessionIssuer,
    private readonly access: AccessService,
    private readonly rates: RateLimiter,
  ) {}

  /** A new account with its own workspace (owner), signed in. */
  async signup(input: SignupInput): Promise<AuthSession> {
    if (!config.auth.allowSignup) throw new ForbiddenError('Sign-up is turned off on this server — ask a workspace owner to add you');
    const email = normalizeEmail(input.email);
    const issues = [
      ...(input.name?.trim() ? [] : ['Enter your name']),
      ...[emailIssue(email), passwordIssue(input.password ?? '')].filter((i): i is string => !!i),
      ...(input.workspaceName?.trim() ? [] : ['Name your workspace']),
    ];
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
    if (await this.users.findByEmail(email)) throw new InvalidOperationError('An account with this email already exists — sign in instead');

    const now = new Date().toISOString();
    const user: User = { id: newId('usr'), name: input.name.trim(), email, passwordHash: await hashPassword(input.password), createdAt: now, updatedAt: now };
    await this.users.create(user);
    const tenantId = newTenantId(input.workspaceName);
    await this.tenants.create({ id: tenantId, name: input.workspaceName.trim(), createdAt: now });
    await this.members.add({ userId: user.id, tenantId, role: 'owner', createdAt: now });
    return this.sessionFor(user);
  }

  async login(input: LoginInput, clientIp: string): Promise<AuthSession> {
    const email = normalizeEmail(input.email ?? '');
    await this.limitAttempts(email, clientIp);
    const user = await this.users.findByEmail(email);
    const valid = await verifyPassword(input.password ?? '', user?.passwordHash ?? (await this.decoyHash));
    if (!user || !valid) throw new UnauthenticatedError('Invalid email or password');
    return this.sessionFor(user);
  }

  logout(sessionId: string) {
    return this.sessions.delete(sessionId);
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthenticatedError('Your account no longer exists');
    return { user: toUserView(user, config.auth.platformAdmins), memberships: await this.membershipsOf(userId) };
  }

  /** Changes the password and signs out every other session of the account. */
  async changePassword(userId: string, sessionId: string, currentPassword: string, newPassword: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthenticatedError('Your account no longer exists');
    // 422, not 401: the session is fine, only the form value is wrong.
    if (!(await verifyPassword(currentPassword ?? '', user.passwordHash))) throw new ValidationFailedError([{ message: 'Your current password is not correct' }]);
    const issue = passwordIssue(newPassword ?? '');
    if (issue) throw new ValidationFailedError([{ message: issue }]);
    await this.users.setPassword(userId, await hashPassword(newPassword), new Date().toISOString());
    await this.sessions.deleteForUser(userId, sessionId);
  }

  async membershipsOf(userId: string): Promise<MembershipView[]> {
    this.access.forget(userId);
    const memberships = await this.members.forUser(userId);
    const tenants = new Map((await this.tenants.findByIds(memberships.map((m) => m.tenantId))).map((t) => [t.id, t.name]));
    return Promise.all(
      memberships.map(async (m) => ({
        tenantId: m.tenantId,
        tenantName: tenants.get(m.tenantId) ?? m.tenantId,
        role: m.role,
        roleName: (await this.access.role(m.tenantId, m.role))?.name ?? m.role,
      })),
    );
  }

  private async sessionFor(user: User): Promise<AuthSession> {
    const { token, expiresAt } = await this.issuer.issue(user.id);
    return { token, expiresAt, user: toUserView(user, config.auth.platformAdmins), memberships: await this.membershipsOf(user.id) };
  }

  /** Slows password guessing: per email and per client address, counted across replicas. */
  private async limitAttempts(email: string, clientIp: string) {
    for (const [key, limit] of [
      [`login:email:${email}`, LOGIN_ATTEMPTS_PER_EMAIL],
      [`login:ip:${clientIp}`, LOGIN_ATTEMPTS_PER_IP],
    ] as const) {
      const decision = await this.rates.consume({ key, limit, windowMs: LOGIN_WINDOW_MS });
      if (!decision.allowed) {
        const seconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
        throw new TooManyRequestsError(`Too many sign-in attempts — try again in ${seconds} s`, seconds);
      }
    }
  }
}
