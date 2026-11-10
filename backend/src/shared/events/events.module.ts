import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueuedEventPublisher } from './queued-event.publisher';
import { DomainEventPublisher } from './domain-events.ports';
import { DOMAIN_EVENTS_QUEUE } from './domain-events.constants';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: DOMAIN_EVENTS_QUEUE })],
  providers: [{ provide: DomainEventPublisher, useClass: QueuedEventPublisher }],
  exports: [DomainEventPublisher],
})
export class EventsModule {}
