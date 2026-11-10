export interface DomainEvent<T = unknown> {
  /** Unique per event; queues use it to drop duplicates and runs to stay idempotent on retries. */
  id: string;
  name: string;
  tenantId: string;
  occurredAt: string;
  payload: T;
}
