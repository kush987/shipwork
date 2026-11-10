import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EventTriggerService } from './event-trigger.service';
import { config } from '../../config/configuration';
import { DOMAIN_EVENTS_QUEUE } from '../../shared/events/domain-events.constants';
import type { DomainEvent } from '../../shared/events/domain-events.types';
import type { Shipment } from '../shipment/domain/shipment.types';

/** Thin adapter: a queued domain event becomes workflow runs. Scale by running more workers. */
@Processor(DOMAIN_EVENTS_QUEUE, { concurrency: config.eventConcurrency })
export class DomainEventProcessor extends WorkerHost {
  constructor(private readonly triggers: EventTriggerService) {
    super();
  }

  async process(job: Job<DomainEvent<{ shipment: Shipment }>>) {
    return this.triggers.handle(job.data);
  }
}
