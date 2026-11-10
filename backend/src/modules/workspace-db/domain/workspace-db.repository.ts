import type { WorkspaceDatabaseConfig } from './workspace-db.types';

/** Where each workspace's database is (platform database). */
export abstract class WorkspaceDatabaseRepository {
  abstract find(tenantId: string): Promise<WorkspaceDatabaseConfig | null>;
  abstract save(config: WorkspaceDatabaseConfig): Promise<void>;
}
