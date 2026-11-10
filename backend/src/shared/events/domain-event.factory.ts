import { newId } from '../domain/id';
import type { DomainEvent } from './domain-events.types';

/** Builds a domain event stamped with the current time (or `occurredAt` when the caller already has one). */
export const domainEvent = <T>(name: string, tenantId: string, payload: T, occurredAt = new Date().toISOString()): DomainEvent<T> => ({
  id: newId('evt'),
  name,
  tenantId,
  occurredAt,
  payload,
});
