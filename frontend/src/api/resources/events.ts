import { request } from '../http';
import { qs } from '../http.helpers';
import type { EmitEventInput, EmitResult, EventDefinition, EventDefinitionInput } from '../types';

export const eventsApi = {
  listEventDefinitions: (includeArchived = false) =>
    request<EventDefinition[]>('GET', `/event-definitions${qs({ includeArchived: includeArchived ? 'true' : undefined })}`),
  createEventDefinition: (body: EventDefinitionInput) => request<EventDefinition>('POST', '/event-definitions', body),
  updateEventDefinition: (id: string, body: EventDefinitionInput) => request<EventDefinition>('PUT', `/event-definitions/${id}`, body),
  archiveEventDefinition: (id: string) => request<EventDefinition>('POST', `/event-definitions/${id}/archive`),
  restoreEventDefinition: (id: string) => request<EventDefinition>('POST', `/event-definitions/${id}/restore`),
  emitEvent: (body: EmitEventInput) => request<EmitResult>('POST', '/events/emit', body),
};
