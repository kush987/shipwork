import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ForbiddenError } from '../domain/errors';
import type { AuthenticatedRequest } from '../auth/auth.types';

/**
 * The workspace the request acts on. The auth guard sets it only after checking the signed-in
 * user is a member with a sufficient role, so a raw `x-tenant-id` header alone never grants
 * access. Every repository call still takes the tenantId explicitly (isolation in data access).
 */
export const TenantId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const tenantId = ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.tenantId;
  if (!tenantId) throw new ForbiddenError('Choose a workspace (x-tenant-id)');
  return tenantId;
});
