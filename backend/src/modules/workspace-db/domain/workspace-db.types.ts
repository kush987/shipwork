/** managed: ShipFlow created and runs it · external: the workspace connected its own MongoDB. */
export type DatabaseMode = 'managed' | 'external';

/** Stored per workspace (platform database). No document = the managed default. */
export interface WorkspaceDatabaseConfig {
  tenantId: string;
  mode: DatabaseMode;
  databaseName: string;
  /** external only: the connection string, AES-GCM encrypted. */
  encryptedUri: string | null;
  /** external only: host names for display, never credentials. */
  hosts: string | null;
  connectedAt: string | null;
  updatedAt: string;
}

export interface CollectionCount {
  name: string;
  label: string;
  documents: number;
}

/** What members see about their workspace's database. Never includes the connection string. */
export interface WorkspaceDatabaseView {
  mode: DatabaseMode;
  databaseName: string;
  host: string;
  status: 'ok' | 'unreachable';
  error?: string;
  connectedAt: string | null;
  collections: CollectionCount[];
}

export type DatabaseTestResult =
  | { ok: true; databaseName: string; host: string; latencyMs: number; hasWorkspaceData: boolean }
  | { ok: false; error: string };

export type SwitchDatabaseInput = { mode: 'managed'; copyData: boolean } | { mode: 'external'; uri: string; copyData: boolean };

/** A validated external connection string, ready to connect to. */
export interface ExternalDatabase {
  uri: string;
  databaseName: string;
  hosts: string;
}
