import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowModule } from '../workflow/workflow.module';
import { ExecutionModule } from '../execution/execution.module';
import { EventTriggerService } from './event-trigger.service';
import { BullmqScheduleRegistry } from './schedule/bullmq-schedule.registry';
import { ScheduleTriggerService } from './schedule/schedule-trigger.service';
import { ScheduleProcessor } from './schedule/schedule.processor';
import { runsWorker } from '../../config/configuration';
import { SCHEDULE_QUEUE } from './schedule/bullmq-schedule.registry.constants';
import { ScheduleRegistry } from './schedule/schedule-registry.ports';
import { DomainEventProcessor } from './domain-event.processor';
import { RecordTriggerService } from './record/record-trigger.service';
import { DataModule } from '../data/data.module';
import { NodesModule } from '../nodes/nodes.module';
import { DOMAIN_EVENTS_QUEUE } from '../../shared/events/domain-events.constants';

/**
 * Everything that *starts* workflows on its own: domain events (from the durable domain-events
 * queue), schedules and record changes (change streams). (API calls start workflows through the runtime gateway.) Only queue-worker
 * roles consume; HTTP roles just publish.
 */
@Module({
  imports: [WorkflowModule, ExecutionModule, DataModule, NodesModule, BullModule.registerQueue({ name: SCHEDULE_QUEUE }, { name: DOMAIN_EVENTS_QUEUE })],
  providers: [
    EventTriggerService,
    { provide: ScheduleRegistry, useClass: BullmqScheduleRegistry },
    ScheduleTriggerService,
    RecordTriggerService,
    ...(runsWorker() ? [ScheduleProcessor, DomainEventProcessor] : []),
  ],
})
export class TriggerModule {}
