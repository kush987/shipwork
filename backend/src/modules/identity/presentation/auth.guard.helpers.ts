import { timingSafeEqual } from 'crypto';
import { READ_METHODS } from '../../../shared/auth/auth.constants';
import { RESOURCE_PARAM } from '../domain/access.constants';
import { areaOf } from '../domain/access';
import type { AccessArea, CheckedPermission, PermissionSpec } from '../../../shared/auth/auth.types';

/** The token of an `Authorization: Bearer <token>` header, or null. */
export const bearerToken = (header: string | undefined): string | null => {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match ? match[1] : null;
};

/** Constant-time comparison of a presented secret with the expected one. */
export function matchesSecret(presented: string | undefined, expected: string): boolean {
  const a = Buffer.from(presented ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The permission a route needs and the resource it is about: @Permission when set, otherwise
 * `<area>:read` (GET) or `<area>:write` from @Area; the resource is `<type>:<id from the path>`,
 * or `<type>:*` for lists and new items. Null when the route declares neither (fail closed).
 */
export function permissionFor(
  area: AccessArea | undefined,
  spec: PermissionSpec | undefined,
  method: string,
  params: Record<string, string | string[] | undefined>,
): CheckedPermission | null {
  const action = spec?.action ?? (area ? `${area}:${READ_METHODS.includes(method) ? 'read' : 'write'}` : null);
  if (!action) return null;
  const info = areaOf(action);
  const type = spec?.resourceType ?? info?.resource ?? '*';
  const param = spec?.param ?? (info && RESOURCE_PARAM[info.area]) ?? 'id';
  const value = params[param];
  return { action, resource: `${type}:${(Array.isArray(value) ? value.join('/') : value) || '*'}` };
}
