// Where a workspace's business data lives (docs/API_CONTRACT.md → Workspace database).

/** managed: a database ShipFlow created for the workspace · external: the owner's own MongoDB. */
export type DatabaseMode = 'managed' | 'external';

/** One business collection and how many of this workspace's documents it holds. */
export interface BusinessCollection {
  name: string;
  label: string;
  documents: number;
}

/** GET /workspace/database. Never contains the connection string. */
export interface WorkspaceDatabase {
  mode: DatabaseMode;
  databaseName: string;
  /** 'ShipFlow-managed', or the external host names (no credentials). */
  host: string;
  status: 'ok' | 'unreachable';
  error?: string;
  connectedAt: string | null;
  collections: BusinessCollection[];
}

/** POST /workspace/database/test. */
export type DatabaseTest =
  | { ok: true; databaseName: string; host: string; latencyMs: number; hasWorkspaceData: boolean }
  | { ok: false; error: string };

/** PUT /workspace/database. */
export type DatabaseSwitchInput = { mode: 'external'; uri: string; copyData: boolean } | { mode: 'managed'; copyData: boolean };
