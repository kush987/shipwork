import { DomainEvent } from './domain-events.types';

/**
 * Port for publishing domain events. QueuedEventPublisher puts workflow-starting events on a
 * BullMQ queue (and notifies in-process listeners); swapping to Kafka/SQS later only means
 * providing a different implementation.
 */
export abstract class DomainEventPublisher {
  abstract publish(event: DomainEvent): Promise<void>;
}
