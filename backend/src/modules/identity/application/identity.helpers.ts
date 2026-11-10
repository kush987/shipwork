import { randomBytes } from 'crypto';
import { slugify } from '../../../shared/util/text';
import { TENANT_PATTERN } from '../../../shared/tenant/tenant.decorator.constants';

/**
 * A new workspace id: readable slug + random suffix. The suffix matters: data written before
 * accounts existed lives under bare ids such as `demo`, and a sign-up must never land on them.
 */
export function newTenantId(workspaceName: string): string {
  const slug = slugify(workspaceName, { separator: '-', maxLength: 40 }) || 'workspace';
  const id = `${slug}-${randomBytes(3).toString('hex')}`;
  return TENANT_PATTERN.test(id) ? id : `workspace-${randomBytes(4).toString('hex')}`;
}

/** A readable one-time password for accounts an owner creates (16 chars, URL-safe). */
export const temporaryPassword = () => randomBytes(12).toString('base64url');

/** The name used when an owner adds someone without one: the part before the @. */
export const nameFromEmail = (email: string) => email.split('@')[0];
