import { escapeRegExp } from 'lodash-es';
import type { Membership, Role, RoleId, User } from '../api/types';
import { humanize } from '../lib/format';
import { BUILT_IN_ROLE_IDS, LOGIN_PATH, READ_VERB, SIGNUP_PATH } from './auth.constants';
import type { AuthState, StoredSession } from './auth.types';

/** The stored workspace when it is still one of the memberships, else the first one. */
export function pickActiveTenant(memberships: Membership[], preferred: string | null): string | null {
  if (preferred && memberships.some((m) => m.tenantId === preferred)) return preferred;
  return memberships[0]?.tenantId ?? null;
}

export const isExpired = (expiresAt: string | null, now = Date.now()) => !!expiresAt && Date.parse(expiresAt) <= now;

/** A stored session that is complete and not expired, else null. */
export function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StoredSession;
    if (!s.token || !s.user || !Array.isArray(s.memberships) || isExpired(s.expiresAt)) return null;
    return s;
  } catch {
    return null;
  }
}

export const activeMembership = (state: Pick<AuthState, 'memberships' | 'activeTenantId'>): Membership | undefined =>
  state.memberships.find((m) => m.tenantId === state.activeTenantId);

/** The role's display name; sessions stored before roles had names fall back to the id. */
export const roleNameOf = (m: { role: RoleId; roleName?: string }) => m.roleName || humanize(m.role);

export const isBuiltInRole = (role: RoleId) => BUILT_IN_ROLE_IDS.includes(role);

/** Built-ins first (in the order the server sends them), then custom roles by name. */
export const sortRoles = (roles: Role[]) =>
  [...roles].sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || (a.builtIn ? 0 : a.name.localeCompare(b.name)));

/** Policy pattern match: `*` stands for any text (`workflows:*`, `workflow:wf_pay*`, `*`). */
export const wildcardMatch = (pattern: string, value: string) =>
  pattern === '*' || pattern === value || new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`).test(value);

/** Whether a list of allowed actions (GET /access/me) covers `action`. */
export const allows = (allowed: readonly string[], action: string) => allowed.some((a) => wildcardMatch(a, action));

export const isReadAction = (action: string) => action.endsWith(`:${READ_VERB}`);

/** No allowed action changes anything — shown as "Read-only" on the account card. */
export const isReadOnly = (allowed: readonly string[]) => allowed.every(isReadAction);

/** Platform-wide settings (couriers) are for platform administrators only. */
export const isPlatformAdmin = (user: User | null) => user?.platformAdmin === true;

/**
 * Where to go after signing in: a path inside the app from `?next=`, never an absolute or
 * protocol-relative URL (open redirect) and never back to the sign-in pages.
 */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  if (next.startsWith(LOGIN_PATH) || next.startsWith(SIGNUP_PATH)) return '/';
  return next;
}

/** `/login?next=<path>` for the page the user was on. */
export const loginUrl = (from: string) => (from && from !== '/' ? `${LOGIN_PATH}?next=${encodeURIComponent(from)}` : LOGIN_PATH);

/** "Asha Rao" → "AR"; falls back to the first letter of the email. */
export function initials(name: string | undefined, email?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length) return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (email?.[0] ?? '?').toUpperCase();
}
