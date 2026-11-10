import type { Member } from '../../api/types';
import type { ListConfig } from '../../components/list/list.types';
import type { RoleOption } from './members.types';

/** Search, sort and filters of the members (the Role filter offers the workspace's roles). */
export const memberList = (roles: RoleOption[]): ListConfig<Member> => ({
  noun: ['member', 'members'],
  searchPlaceholder: 'Search name or email',
  searchText: (m) => `${m.name} ${m.email} ${m.roleName}`,
  // null keeps the order the page passes in: owners first, then by name.
  defaultSort: null,
  fields: [
    { key: 'name', label: 'Name', kind: 'text', get: (m) => m.name },
    { key: 'email', label: 'Email', kind: 'text', get: (m) => m.email },
    { key: 'role', label: 'Role', kind: 'enum', quick: true, get: (m) => m.role, options: roles.map((r) => ({ value: r.id, label: r.name })) },
    { key: 'since', label: 'Since', kind: 'date', get: (m) => m.createdAt },
  ],
});
