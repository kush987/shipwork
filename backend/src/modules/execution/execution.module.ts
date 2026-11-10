import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { NodesModule } from '../nodes/nodes.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { ExecutionDoc, ExecutionSchema, NodeExecutionDoc, NodeExecutionSchema } from './infrastructure/execution.schema';
import { MongoExecutionRepository } from './infrastructure/mongo-execution.repository';
import { BullmqStepScheduler } from './infrastructure/bullmq-step.scheduler';
import { ShipmentScopeLoader } from './infrastructure/shipment-scope.loader';
import { ExecutionProcessor } from './infrastructure/execution.processor';
import { ExecutionEngine } from './application/execution-engine';
import { ExecutionService } from './application/execution.service';
import { SyncExecutionRunner } from './application/sync-execution.runner';
import { TestRunService } from './application/test-run.service';
import { ExecutionController } from './presentation/execution.controller';
import { config, runsWorker } from '../../config/configuration';
import { ExecutionRepository } from './domain/execution.repository';
import { ExecutionScopeLoader, StepScheduler } from './domain/execution.ports';
import { STEP_QUEUE } from './infrastructure/bullmq-step.scheduler.constants';
import { RedisTenantBacklog } from './infrastructure/redis-tenant-backlog';
import { StepParking } from './infrastructure/step-parking';
import { TenantBacklog } from './application/step-fairness.ports';
import { TenantStepCap } from './application/tenant-step-cap';
import { STEP_FAIRNESS_OPTIONS, STEP_LEASE_MS } from './application/step-fairness.constants';
import { WorkflowCallService } from './application/workflow-call.service';

@Module({
  imports: [
    NodesModule,
    WorkflowModule,
    ShipmentModule,
    BullModule.registerQueue({ name: STEP_QUEUE }),
    MongooseModule.forFeature([
      { name: ExecutionDoc.name, schema: ExecutionSchema },
      { name: NodeExecutionDoc.name, schema: NodeExecutionSchema },
    ]),
  ],
  controllers: [ExecutionController],
  providers: [
    { provide: ExecutionRepository, useClass: MongoExecutionRepository },
    { provide: StepScheduler, useClass: BullmqStepScheduler },
    { provide: ExecutionScopeLoader, useClass: ShipmentScopeLoader },
    // Fair sharing of the step queue between tenants (ordering by backlog + a cap on running steps).
    { provide: TenantBacklog, useClass: RedisTenantBacklog },
    { provide: STEP_FAIRNESS_OPTIONS, useValue: { tenantMaxActiveSteps: config.fairness.tenantMaxActiveSteps, leaseMs: STEP_LEASE_MS } },
    TenantStepCap,
    StepParking,
    ExecutionEngine,
    SyncExecutionRunner,
    // Lets Run workflow steps start other workflows.
    WorkflowCallService,
    ExecutionService,
    TestRunService,
    // APP_ROLE=api/runtime run no queue workers, so the HTTP tiers and the execution tier scale independently.
    ...(runsWorker() ? [ExecutionProcessor] : []),
  ],
  exports: [ExecutionEngine, ExecutionService, SyncExecutionRunner, TenantBacklog, TenantStepCap],
})
export class ExecutionModule {}
