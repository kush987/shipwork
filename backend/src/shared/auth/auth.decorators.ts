import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UnauthenticatedError } from '../domain/errors';
import { ANY_MEMBER, AREA, IS_PUBLIC, NO_TENANT, OPS_ONLY, PERMISSION, PLATFORM_ADMIN_WRITES } from './auth.constants';
import type { AccessArea, AuthContext, AuthenticatedRequest, PermissionSpec } from './auth.types';

/** No sign-in needed (data plane, webhooks, health, sign-in itself). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Signed in, but not about one workspace (my account, sign-out). */
export const NoTenant = () => SetMetadata(NO_TENANT, true);

/**
 * What a controller's routes are about (class decorator). Its routes need `<area>:read` for GET and
 * `<area>:write` otherwise, on the resource named by the route's id parameter — unless a route says
 * otherwise with @Permission.
 */
export const Area = (area: AccessArea) => SetMetadata(AREA, area);

/**
 * The permission a route needs when the default isn't right: a special verb (`workflows:publish`,
 * `members:manage`), a read that is a POST (`shipments:read` for a quote), or another resource.
 */
export const Permission = (action: string, spec: Omit<PermissionSpec, 'action'> = {}) => SetMetadata(PERMISSION, { action, ...spec });

/** Any member of the workspace, whatever their role (e.g. "what may I do here?"). */
export const AnyMember = () => SetMetadata(ANY_MEMBER, true);

/** Reading is open to members; changing needs a platform administrator (settings shared by all workspaces). */
export const PlatformAdminWrites = () => SetMetadata(PLATFORM_ADMIN_WRITES, true);

/** Operational data across workspaces: the OPS_TOKEN header, or a platform administrator's session. */
export const OpsOnly = () => SetMetadata(OPS_ONLY, true);

/** The signed-in caller (set by the auth guard). */
export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  if (!auth) throw new UnauthenticatedError('Sign in to continue');
  return auth;
});
