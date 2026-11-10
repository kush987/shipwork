import type { Connection } from 'mongoose';
import type { CollectionCount, ExternalDatabase, WorkspaceDatabaseConfig } from '../domain/workspace-db.types';

/** Opens and caches the databases workspaces use (managed pool or their own MongoDB). */
export abstract class WorkspaceConnections {
  /** The workspace's current database configuration (cached briefly). */
  abstract configOf(tenantId: string): Promise<WorkspaceDatabaseConfig>;
  /** A connection to the database a configuration points at. */
  abstract connect(config: WorkspaceDatabaseConfig): Promise<Connection>;
  /** A short-lived connection to test or prepare an external database; the caller closes it. */
  abstract openExternal(db: ExternalDatabase): Promise<Connection>;
  /** Drop cached configuration and connections of a workspace, on every server process. */
  abstract forget(tenantId: string): Promise<void>;
}

/** Copies and counts one workspace's business documents between databases. */
export abstract class BusinessDataCopier {
  abstract counts(conn: Connection, tenantId: string): Promise<CollectionCount[]>;
  abstract copy(tenantId: string, from: Connection, to: Connection): Promise<CollectionCount[]>;
  abstract remove(conn: Connection, tenantId: string): Promise<number>;
  /** Other workspaces whose data is in this database (a workspace's database is its own). */
  abstract otherWorkspaces(conn: Connection, tenantId: string): Promise<string[]>;
}
