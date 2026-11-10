import type { AuditFilters, RecordsQuery } from './types';

/** react-query keys shared across pages, so reads and invalidations always agree. */
export const queryKeys = {
  stats: ['stats'] as const,
  catalog: ['catalog'] as const,
  builtinNodes: ['builtin-nodes'] as const,
  builtinNode: (type: string) => ['builtin-node', type] as const,
  workflows: ['workflows'] as const,
  workflow: (id: string) => ['workflow', id] as const,
  endpoints: ['endpoints'] as const,
  endpoint: (id: string) => ['endpoint', id] as const,
  apiKeys: ['api-keys'] as const,
  collections: ['collections'] as const,
  /** Prefix of every records query of one collection (use for invalidation). */
  records: (name: string) => ['records', name] as const,
  recordsPage: (name: string, q: RecordsQuery) => ['records', name, q] as const,
  /** A collection's indexes and its stats (sizes); both change with its records. */
  collectionIndexes: (name: string) => ['records', name, 'indexes'] as const,
  collectionStats: (name: string) => ['records', name, 'stats'] as const,
  /** Collections + built-in data, as the data steps and the Data page list them. */
  dataSources: ['data-sources'] as const,
  sourceRecordsPage: (name: string, q: RecordsQuery) => ['source-records', name, q] as const,
  /** Prefix of every custom node list query (use for invalidation). */
  customNodes: ['custom-nodes'] as const,
  customNodeList: (includeArchived: boolean) => ['custom-nodes', includeArchived ? 'all' : 'active'] as const,
  customNode: (id: string) => ['custom-node', id] as const,
  customNodeTemplates: ['custom-node-templates'] as const,
  events: ['events'] as const,
  me: ['auth', 'me'] as const,
  members: ['members'] as const,
  workspaceDatabase: ['workspace-database'] as const,
  authProviders: ['auth-providers'] as const,
  accessCatalog: ['access-catalog'] as const,
  /** What the signed-in member may do (GET /access/me). */
  myAccess: ['access-me'] as const,
  roles: ['roles'] as const,
  /** Prefix of every audit log query (use for invalidation). */
  audit: ['audit'] as const,
  auditPages: (q: AuditFilters) => ['audit', q] as const,
};
