import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { CustomNodeModule } from '../custom-node/custom-node.module';
import { ExecutionModule } from '../execution/execution.module';
import { STEP_QUEUE } from '../execution/infrastructure/bullmq-step.scheduler.constants';
import { DOMAIN_EVENTS_QUEUE } from '../../shared/events/domain-events.constants';

@Module({
  imports: [CustomNodeModule, ExecutionModule, BullModule.registerQueue({ name: STEP_QUEUE }, { name: DOMAIN_EVENTS_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}
