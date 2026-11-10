import type { AuthProvider, AuthProviderType } from '../../api/types';
import type { ListConfig } from '../../components/list/list.types';
import { PROVIDER_TYPE_LABEL } from './sign-in.constants';

/** Search, sort and filters of the sign-in providers. */
export const PROVIDER_LIST: ListConfig<AuthProvider> = {
  noun: ['provider', 'providers'],
  searchPlaceholder: 'Search name, issuer or audience',
  searchText: (p) => [p.name, p.issuer, p.audience, PROVIDER_TYPE_LABEL[p.type]].join(' '),
  defaultSort: { key: 'name', dir: 'asc' },
  fields: [
    { key: 'name', label: 'Provider', kind: 'text', get: (p) => p.name },
    {
      key: 'type',
      label: 'Type',
      kind: 'enum',
      quick: true,
      get: (p) => p.type,
      options: (Object.keys(PROVIDER_TYPE_LABEL) as AuthProviderType[]).map((t) => ({ value: t, label: PROVIDER_TYPE_LABEL[t] })),
    },
    { key: 'issuer', label: 'Issuer', kind: 'text', get: (p) => p.issuer },
    { key: 'audience', label: 'Audience', kind: 'text', get: (p) => p.audience, sortable: false },
    { key: 'endpoints', label: 'Endpoints', kind: 'number', get: (p) => p.endpointCount },
    { key: 'updated', label: 'Updated', kind: 'date', get: (p) => p.updatedAt },
    { key: 'created', label: 'Created', kind: 'date', get: (p) => p.createdAt },
  ],
};
