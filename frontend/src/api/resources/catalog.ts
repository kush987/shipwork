import { request } from '../http';
import type { EventOption, Health, NodeTypeDefinition, Stats } from '../types';

export const catalogApi = {
  nodeCatalog: () => request<NodeTypeDefinition[]>('GET', '/nodes/catalog'),
  eventCatalog: () => request<EventOption[]>('GET', '/events/catalog'),
  stats: () => request<Stats>('GET', '/stats'),
  health: () => request<Health>('GET', '/health', undefined, { tenant: false, auth: false }),
};
