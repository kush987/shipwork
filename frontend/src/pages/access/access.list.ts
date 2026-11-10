import type { AccessArea, AuditEvent, Role } from '../../api/types';
import type { ListConfig } from '../../components/list/list.types';
import { HTTP_METHODS } from '../../lib/endpoints.constants';
import { policySummary } from './access.helpers';

/** Search, sort and filters of the roles (what a role allows is worded from the permission catalog). */
export const roleList = (areas: AccessArea[]): ListConfig<Role> => ({
  noun: ['role', 'roles'],
  searchPlaceholder: 'Search name, description or what it allows',
  searchText: (r) => `${r.name} ${r.description} ${policySummary(r.policy, areas).text}`,
  // null keeps built-in roles first, then custom roles by name.
  defaultSort: null,
  fields: [
    { key: 'name', label: 'Role', kind: 'text', get: (r) => r.name },
    {
      key: 'type',
      label: 'Type',
      kind: 'enum',
      quick: true,
      get: (r) => (r.builtIn ? 'builtin' : 'custom'),
      options: [
        { value: 'builtin', label: 'Built-in' },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'allows', label: 'What it allows', kind: 'text', get: (r) => policySummary(r.policy, areas).text, sortable: false },
    { key: 'members', label: 'Members', kind: 'number', get: (r) => r.memberCount },
    { key: 'updated', label: 'Updated', kind: 'date', get: (r) => r.updatedAt },
  ],
});

/** Search and sort of the audit events loaded so far (member, decision and action are asked of the server). */
export const AUDIT_LIST: ListConfig<AuditEvent> = {
  noun: ['loaded event', 'loaded events'],
  searchPlaceholder: 'Search loaded events: resource, path, reason, IP',
  searchText: (e) => [e.actor?.email, e.action, e.resource, e.method, e.path, e.reason, e.ip, e.status].join(' '),
  defaultSort: { key: 'time', dir: 'desc' },
  fields: [
    { key: 'time', label: 'Time', kind: 'date', get: (e) => e.at },
    { key: 'who', label: 'Who', kind: 'text', get: (e) => e.actor?.email },
    { key: 'action', label: 'Action', kind: 'text', get: (e) => e.action },
    { key: 'resource', label: 'Resource', kind: 'text', get: (e) => e.resource },
    { key: 'method', label: 'Method', kind: 'enum', quick: true, get: (e) => e.method, options: HTTP_METHODS.map((m) => ({ value: m, label: m })) },
    { key: 'path', label: 'Request', kind: 'text', get: (e) => e.path },
    {
      key: 'decision',
      label: 'Decision',
      kind: 'enum',
      get: (e) => e.decision,
      options: [
        { value: 'allowed', label: 'Allowed' },
        { value: 'denied', label: 'Denied' },
      ],
    },
    { key: 'status', label: 'Status', kind: 'number', get: (e) => e.status },
    { key: 'reason', label: 'Reason', kind: 'text', get: (e) => e.reason },
    { key: 'ip', label: 'IP', kind: 'text', get: (e) => e.ip },
  ],
};
