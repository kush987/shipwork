import { request } from '../http';
import type { DatabaseSwitchInput, DatabaseTest, WorkspaceDatabase } from '../types';

/** The active workspace's business database. Testing and switching need the owner role. */
export const workspaceDatabaseApi = {
  getWorkspaceDatabase: () => request<WorkspaceDatabase>('GET', '/workspace/database'),
  testWorkspaceDatabase: (uri: string) => request<DatabaseTest>('POST', '/workspace/database/test', { uri }),
  switchWorkspaceDatabase: (input: DatabaseSwitchInput) => request<WorkspaceDatabase>('PUT', '/workspace/database', input),
};
