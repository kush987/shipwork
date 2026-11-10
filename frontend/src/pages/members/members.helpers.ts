import { uniqBy } from 'lodash-es';
import type { Member, Role, RoleId } from '../../api/types';
import { BUILT_IN_ROLE_IDS, OWNER_ROLE } from '../../auth/auth.constants';
import { isBuiltInRole, roleNameOf, sortRoles } from '../../auth/auth.helpers';
import type { Tone } from '../../components/ui.types';
import { humanize } from '../../lib/format';
import type { RoleOption } from './members.types';

export const ownerCount = (members: Member[]) => members.filter((m) => m.role === OWNER_ROLE).length;

/** True when `member` is the workspace's only owner — they can't be demoted or removed (the server enforces it too). */
export const isLastOwner = (member: Member, members: Member[]) => member.role === OWNER_ROLE && ownerCount(members) === 1;

/** Why a role change isn't allowed, or undefined. */
export function roleChangeProblem(member: Member, role: RoleId, members: Member[]): string | undefined {
  if (role !== OWNER_ROLE && isLastOwner(member, members)) return 'A workspace needs at least one owner — make someone else owner first';
  return undefined;
}

/** Owners first, then by name. */
export const sortMembers = (members: Member[]) =>
  [...members].sort((a, b) => Number(b.role === OWNER_ROLE) - Number(a.role === OWNER_ROLE) || a.name.localeCompare(b.name));

/**
 * Roles a member can be given: every role (built-in, then custom) when the list loaded; otherwise the
 * built-ins plus the roles members already have, so each select still shows its current value.
 */
export function roleOptions(roles: Role[] | undefined, members: Member[]): RoleOption[] {
  if (roles) return sortRoles(roles);
  const builtIns = BUILT_IN_ROLE_IDS.map((id) => ({ id, name: humanize(id) }));
  return uniqBy([...builtIns, ...members.map((m) => ({ id: m.role, name: roleNameOf(m) }))], 'id');
}

export const roleTone = (role: RoleId): Tone => (role === OWNER_ROLE ? 'accent' : isBuiltInRole(role) ? 'neutral' : 'violet');
