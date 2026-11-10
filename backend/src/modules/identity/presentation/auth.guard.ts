import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../../../shared/domain/errors';
import { ANY_MEMBER, AREA, IS_PUBLIC, NO_TENANT, OPS_ONLY, OPS_TOKEN_HEADER, PERMISSION, PLATFORM_ADMIN_WRITES, READ_METHODS } from '../../../shared/auth/auth.constants';
import { TENANT_HEADER, TENANT_PATTERN } from '../../../shared/tenant/tenant.decorator.constants';
import { config } from '../../../config/configuration';
import { AuditService } from '../../audit/application/audit.service';
import { requestAuditEntry } from '../../audit/presentation/audit.helpers';
import { AccessService } from '../application/access.service';
import { decide, denialMessage } from '../domain/access';
import { bearerToken, matchesSecret, permissionFor } from './auth.guard.helpers';
import type { AccessArea, AuthContext, AuthenticatedRequest, PermissionSpec } from '../../../shared/auth/auth.types';

/**
 * Global guard for the control plane. Every route needs a valid session unless marked @Public();
 * workspace routes also need membership of the workspace in `x-tenant-id`, and the member's role
 * (built-in or custom) must allow the route's permission — `<area>:read` / `<area>:write` from
 * @Area, or what @Permission names — on the resource the route is about. Denials are audited.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T | undefined>(key, [ctx.getHandler(), ctx.getClass()]);
    if (meta<boolean>(IS_PUBLIC)) return true;

    const req = ctx.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const opsOnly = meta<boolean>(OPS_ONLY);
    if (opsOnly && config.auth.opsToken && matchesSecret(req.header(OPS_TOKEN_HEADER), config.auth.opsToken)) return true;
    const token = bearerToken(req.header('authorization'));
    if (!token) throw new UnauthenticatedError('Sign in to continue');
    const identity = await this.access.authenticate(token);
    if (!identity) throw new UnauthenticatedError('Your session has expired — sign in again');
    const auth: AuthContext = { userId: identity.user.id, email: identity.user.email, sessionId: identity.sessionId };
    req.auth = auth;

    const isPlatformAdmin = config.auth.platformAdmins.includes(auth.email);
    if (opsOnly) {
      if (!isPlatformAdmin) throw new ForbiddenError('Only platform administrators (or the ops token) can read this');
      return true;
    }
    const writing = !READ_METHODS.includes(req.method);
    if (writing && meta<boolean>(PLATFORM_ADMIN_WRITES) && !isPlatformAdmin) {
      throw new ForbiddenError('Only platform administrators can change this — it applies to every workspace');
    }
    if (meta<boolean>(NO_TENANT)) return true;

    const tenantId = req.header(TENANT_HEADER) ?? '';
    if (!TENANT_PATTERN.test(tenantId)) throw new ForbiddenError(`Choose a workspace (${TENANT_HEADER})`);
    const roleId = await this.access.roleIn(auth.userId, tenantId);
    if (!roleId) throw new ForbiddenError(`You are not a member of workspace “${tenantId}”`);
    const role = await this.access.role(tenantId, roleId);
    Object.assign(auth, { tenantId, role: roleId, roleName: role?.name ?? roleId });
    if (meta<boolean>(ANY_MEMBER)) return true;

    const permission = permissionFor(meta<AccessArea>(AREA), meta<PermissionSpec>(PERMISSION), req.method, req.params ?? {});
    if (!permission) {
      // Fail closed: a route without a permission is a bug, not an open door.
      this.logger.error(`No permission declared for ${req.method} ${(req.originalUrl ?? '').split('?')[0]} — add @Area or @Permission`);
      throw new ForbiddenError('This action has no permission set up — nobody can use it yet');
    }
    req.access = permission;
    const decision = role ? decide(role.policy, permission.action, permission.resource) : null;
    if (!decision?.allowed) {
      const message = role ? denialMessage(role.name, permission.action, permission.resource) : `Your role (${roleId}) no longer exists — ask an owner to give you another`;
      const entry = requestAuditEntry(req, { decision: 'denied', status: 403, reason: decision?.reason ?? 'Role no longer exists' });
      if (entry) void this.audit.record(entry);
      throw new ForbiddenError(message);
    }
    return true;
  }
}
