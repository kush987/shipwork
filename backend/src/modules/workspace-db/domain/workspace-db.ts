import { createHash } from 'crypto';
import { MANAGED_DB_PREFIX, MAX_DB_NAME_LENGTH } from './workspace-db.constants';
import type { WorkspaceDatabaseConfig } from './workspace-db.types';

/** The managed database of a workspace: `sfb_<workspace id>`, hashed when too long. */
export function managedDatabaseName(tenantId: string): string {
  const name = `${MANAGED_DB_PREFIX}${tenantId}`;
  if (name.length <= MAX_DB_NAME_LENGTH) return name;
  return `${MANAGED_DB_PREFIX}${tenantId.slice(0, 30)}_${createHash('sha256').update(tenantId).digest('hex').slice(0, 16)}`;
}

/** The configuration a workspace has before anyone changed it. */
export const managedDefault = (tenantId: string): WorkspaceDatabaseConfig => ({
  tenantId,
  mode: 'managed',
  databaseName: managedDatabaseName(tenantId),
  encryptedUri: null,
  hosts: null,
  connectedAt: null,
  updatedAt: new Date(0).toISOString(),
});
