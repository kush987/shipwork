import type { ApiEndpoint, ApiKey } from '../../api/types';
import type { ListConfig } from '../../components/list/list.types';
import { scopeRoutes } from './api-keys.helpers';

/** Search, sort and filters of the API keys (the routes a key may call come from the endpoints). */
export const apiKeyList = (endpoints: ApiEndpoint[] | undefined): ListConfig<ApiKey> => ({
  noun: ['API key', 'API keys'],
  searchPlaceholder: 'Search name, key prefix or route',
  searchText: (k) => [k.name, k.prefix, ...scopeRoutes(k, endpoints)].join(' '),
  defaultSort: { key: 'created', dir: 'desc' },
  fields: [
    { key: 'name', label: 'Name', kind: 'text', get: (k) => k.name },
    { key: 'prefix', label: 'Key', kind: 'text', get: (k) => k.prefix },
    {
      key: 'scope',
      label: 'May call',
      kind: 'enum',
      quick: true,
      get: (k) => (k.endpointIds === null ? 'all' : 'some'),
      options: [
        { value: 'all', label: 'All API-key endpoints' },
        { value: 'some', label: 'Chosen endpoints' },
      ],
    },
    { key: 'endpoints', label: 'Endpoints it may call', kind: 'number', get: (k) => (k.endpointIds === null ? null : k.endpointIds.length) },
    { key: 'routes', label: 'Route', kind: 'text', get: (k) => scopeRoutes(k, endpoints).join(' '), sortable: false },
    { key: 'created', label: 'Created', kind: 'date', get: (k) => k.createdAt },
    { key: 'used', label: 'Last used', kind: 'date', get: (k) => k.lastUsedAt },
    {
      key: 'status',
      label: 'Status',
      kind: 'enum',
      quick: true,
      get: (k) => (k.revoked ? 'revoked' : 'active'),
      options: [
        { value: 'active', label: 'Active' },
        { value: 'revoked', label: 'Revoked' },
      ],
    },
  ],
});
