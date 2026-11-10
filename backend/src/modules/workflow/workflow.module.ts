import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NodesModule } from '../nodes/nodes.module';
import { CustomEventModule } from '../custom-event/custom-event.module';
import { DataModule } from '../data/data.module';
import { AuthProviderReferenceChecker, CollectionReferenceChecker, EventReferenceChecker, WorkflowReferenceChecker } from './infrastructure/reference-checkers';
import { AppAuthModule } from '../app-auth/app-auth.module';
import { WorkflowDoc, WorkflowSchema, WorkflowVersionDoc, WorkflowVersionSchema } from './infrastructure/workflow.schema';
import { WorkflowRepository, WorkflowVersionRepository } from './domain/workflow.repository';
import { MongoWorkflowRepository, MongoWorkflowVersionRepository } from './infrastructure/mongo-workflow.repository';
import { WorkflowService } from './application/workflow.service';
import { WorkflowController } from './presentation/workflow.controller';
import { NodeCatalogController } from './presentation/node-catalog.controller';
import { REFERENCE_CHECKERS } from './domain/reference-checker.constants';
import { providerList } from '../../shared/nest/providers';

@Module({
  imports: [
    AppAuthModule,
    NodesModule,
    CustomEventModule,
    DataModule,
    MongooseModule.forFeature([
      { name: WorkflowDoc.name, schema: WorkflowSchema },
      { name: WorkflowVersionDoc.name, schema: WorkflowVersionSchema },
    ]),
  ],
  controllers: [WorkflowController, NodeCatalogController],
  providers: [
    { provide: WorkflowRepository, useClass: MongoWorkflowRepository },
    { provide: WorkflowVersionRepository, useClass: MongoWorkflowVersionRepository },
    ...providerList(REFERENCE_CHECKERS, [EventReferenceChecker, CollectionReferenceChecker, AuthProviderReferenceChecker, WorkflowReferenceChecker]),
    WorkflowService,
  ],
  exports: [WorkflowService],
})
export class WorkflowModule {}
