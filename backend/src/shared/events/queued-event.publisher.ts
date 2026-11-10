import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { DomainEventPublisher } from './domain-events.ports';
import { DOMAIN_EVENTS_QUEUE, EVENT_JOB_ATTEMPTS } from './domain-events.constants';
import { startsWorkflows } from './domain-events.helpers';
import type { DomainEvent } from './domain-events.types';

/**
 * Publishes in two ways:
 * - events that can start workflows go onto a durable queue (Redis). Queue workers turn them into
 *   runs, so the request that caused the event doesn't wait for that, a crash or deploy doesn't
 *   lose them, failures are retried with backoff, and failed events stay inspectable for a week;
 * - every event is also emitted in-process, for listeners that update this instance right away
 *   (schedule registration on publish, endpoint route cache).
 */
@Injectable()
export class QueuedEventPublisher extends DomainEventPublisher {
  constructor(
    private readonly emitter: EventEmitter2,
    @InjectQueue(DOMAIN_EVENTS_QUEUE) private readonly queue: Queue<DomainEvent>,
  ) {
    super();
  }

  async publish(event: DomainEvent): Promise<void> {
    if (startsWorkflows(event.name)) {
      await this.queue.add(event.name, event, {
        // The event id dedupes: publishing the same event twice queues it once.
        jobId: event.id,
        attempts: EVENT_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 3_600, count: 10_000 },
        removeOnFail: { age: 7 * 24 * 3_600 },
      });
    }
    await this.emitter.emitAsync(event.name, event);
  }
}
