import { omit, uniq } from 'lodash';
import { getPath } from '../../../shared/util/path';
import { MIN_SECRET_LENGTH, PROVIDER_TYPES, TOKEN_TTL_MINUTES } from './app-auth.constants';
import type { AuthProvider, AuthProviderInput, AuthProviderView } from './app-auth.types';

export const toProviderView = (p: AuthProvider): AuthProviderView => ({ ...omit(p, ['tenantId', 'encryptedSecret']), hasSecret: !!p.encryptedSecret });

/** The issuer ShipFlow writes into tokens of its own providers. */
export const shipflowIssuer = (tenantId: string, providerId: string) => `shipflow:${tenantId}:${providerId}`;

/**
 * Roles from a token claim: a list, or one string of space/comma separated names (OAuth "scope"
 * style). The claim is looked up by its exact name first — namespaced claims such as
 * `https://acme.com/roles` contain dots — then as a dot path into nested claims.
 */
export function rolesFrom(claims: Record<string, unknown>, path: string): string[] {
  const value = path in claims ? claims[path] : getPath(claims, path);
  const list = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[\s,]+/) : [];
  return uniq(list.map((r) => r.trim()).filter(Boolean));
}

/** Problems with a provider as entered; `existing` is set when editing (its secret may be kept). */
export function providerIssues(input: AuthProviderInput, existing?: AuthProvider): string[] {
  const issues: string[] = [];
  if (!input.name?.trim()) issues.push('Name the sign-in provider');
  if (!PROVIDER_TYPES.includes(input.type)) issues.push(`Type must be one of ${PROVIDER_TYPES.join(', ')}`);
  if (existing && existing.type !== input.type) issues.push('The type of a provider cannot change — create a new one');
  if (input.type !== 'shipflow' && !input.issuer?.trim()) issues.push('Enter the issuer (the "iss" your identity provider puts in tokens)');
  if (input.type === 'jwks' && !/^https:\/\//.test(input.jwksUrl ?? '')) issues.push('Enter the https URL of the JSON Web Key Set (JWKS)');
  const keepsSecret = !!existing?.encryptedSecret && input.secret === undefined;
  if (input.type === 'secret' && !keepsSecret && (input.secret ?? '').length < MIN_SECRET_LENGTH) issues.push(`The shared secret needs at least ${MIN_SECRET_LENGTH} characters`);
  const ttl = input.tokenTtlMinutes ?? TOKEN_TTL_MINUTES.default;
  if (!Number.isInteger(ttl) || ttl < TOKEN_TTL_MINUTES.min || ttl > TOKEN_TTL_MINUTES.max) {
    issues.push(`Token lifetime must be ${TOKEN_TTL_MINUTES.min}–${TOKEN_TTL_MINUTES.max} minutes`);
  }
  return issues;
}
