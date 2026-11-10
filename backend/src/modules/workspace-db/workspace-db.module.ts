import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantModels } from '../../shared/tenancy/tenant-models.ports';
import { WorkspaceDatabaseDoc, WorkspaceDatabaseSchema } from './infrastructure/workspace-db.schema';
import { MongoWorkspaceDatabaseRepository } from './infrastructure/mongo-workspace-db.repository';
import { TenantConnections } from './infrastructure/tenant-connections';
import { MongoBusinessDataCopier } from './infrastructure/business-data-copier';
import { WorkspaceDatabaseRepository } from './domain/workspace-db.repository';
import { BusinessDataCopier, WorkspaceConnections } from './application/workspace-db.ports';
import { WorkspaceDatabaseService } from './application/workspace-db.service';
import { WorkspaceDatabaseController } from './presentation/workspace-db.controller';

/**
 * Each workspace's own business database (managed or connected). Global: business repositories
 * in other modules get their per-workspace models through TenantModels.
 */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: WorkspaceDatabaseDoc.name, schema: WorkspaceDatabaseSchema }])],
  controllers: [WorkspaceDatabaseController],
  providers: [
    { provide: WorkspaceDatabaseRepository, useClass: MongoWorkspaceDatabaseRepository },
    TenantConnections,
    { provide: TenantModels, useExisting: TenantConnections },
    { provide: WorkspaceConnections, useExisting: TenantConnections },
    { provide: BusinessDataCopier, useClass: MongoBusinessDataCopier },
    WorkspaceDatabaseService,
  ],
  exports: [TenantModels, WorkspaceConnections, BusinessDataCopier, TenantConnections],
})
export class WorkspaceDbModule {}
