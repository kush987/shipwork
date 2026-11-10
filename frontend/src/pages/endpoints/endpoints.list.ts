import type { ApiEndpoint } from '../../api/types';
import type { ListConfig } from '../../components/list/list.types';
import { HTTP_METHODS } from '../../lib/endpoints.constants';
import { AUTH_LABEL } from './endpoints.constants';
import { endpointSearchText, endpointStatusOf } from './endpoints.helpers';

/** Search, sort and filters of the Endpoints list. */
export const ENDPOINT_LIST: ListConfig<ApiEndpoint> = {
  noun: ['endpoint', 'endpoints'],
  searchPlaceholder: 'Search path, name or workflow',
  searchText: endpointSearchText,
  defaultSort: { key: 'path', dir: 'asc' },
  fields: [
    { key: 'path', label: 'Endpoint', kind: 'text', get: (e) => e.path },
    { key: 'name', label: 'Name', kind: 'text', get: (e) => e.name },
    { key: 'method', label: 'Method', kind: 'enum', quick: true, get: (e) => e.method, options: HTTP_METHODS.map((m) => ({ value: m, label: m })) },
    {
      key: 'mode',
      label: 'Mode',
      kind: 'enum',
      get: (e) => e.mode,
      options: [
        { value: 'sync', label: 'sync' },
        { value: 'async', label: 'async' },
      ],
    },
    {
      key: 'auth',
      label: 'Auth',
      kind: 'enum',
      quick: true,
      get: (e) => e.auth,
      options: (Object.keys(AUTH_LABEL) as ApiEndpoint['auth'][]).map((a) => ({ value: a, label: AUTH_LABEL[a] })),
    },
    { key: 'workflow', label: 'Workflow', kind: 'text', get: (e) => e.workflow?.name },
    {
      key: 'status',
      label: 'Status',
      kind: 'enum',
      quick: true,
      get: endpointStatusOf,
      options: [
        { value: 'ready', label: 'Ready' },
        { value: 'issues', label: 'Has issues' },
        { value: 'disabled', label: 'Disabled' },
      ],
    },
    {
      key: 'enabled',
      label: 'Enabled',
      kind: 'enum',
      get: (e) => (e.enabled ? 'on' : 'off'),
      options: [
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ],
    },
    {
      key: 'authorizer',
      label: 'Authorizer',
      kind: 'enum',
      get: (e) => (e.authorizerWorkflowId ? 'yes' : 'no'),
      options: [
        { value: 'yes', label: 'Has an authorizer' },
        { value: 'no', label: 'No authorizer' },
      ],
    },
    { key: 'fields', label: 'Request fields', kind: 'number', get: (e) => e.requestSchema.length },
    { key: 'rate', label: 'Rate limit / min', kind: 'number', get: (e) => e.rateLimitPerMinute },
    { key: 'timeout', label: 'Timeout (s)', kind: 'number', get: (e) => (e.mode === 'sync' ? e.timeoutMs / 1000 : null) },
    { key: 'updated', label: 'Updated', kind: 'date', get: (e) => e.updatedAt },
    { key: 'created', label: 'Created', kind: 'date', get: (e) => e.createdAt },
  ],
};
