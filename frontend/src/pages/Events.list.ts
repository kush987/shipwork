import type { EventDefinition, EventOption, Workflow } from '../api/types';
import type { ListConfig } from '../components/list/list.types';

const startsWorkflows = (count: number) => (count > 0 ? 'yes' : 'no');
const STARTS_OPTIONS = [
  { value: 'yes', label: 'Starts workflows' },
  { value: 'no', label: 'Starts nothing' },
];

/** Search, sort and filters of the custom events (they depend on which workflows each one starts). */
export const customEventList = (listeners: Record<string, Workflow[]>): ListConfig<EventDefinition> => ({
  noun: ['custom event', 'custom events'],
  searchPlaceholder: 'Search name, key, description or payload',
  searchText: (d) => [d.label, d.key, d.description, ...d.payloadSchema.map((f) => `${f.key} ${f.label}`)].join(' '),
  defaultSort: { key: 'name', dir: 'asc' },
  fields: [
    { key: 'name', label: 'Event', kind: 'text', get: (d) => d.label },
    { key: 'key', label: 'Key', kind: 'text', get: (d) => d.key },
    { key: 'starts', label: 'Workflows', kind: 'enum', quick: true, get: (d) => startsWorkflows(listeners[d.key]?.length ?? 0), options: STARTS_OPTIONS },
    { key: 'workflows', label: 'Workflows it starts', kind: 'number', get: (d) => listeners[d.key]?.length ?? 0 },
    { key: 'payload', label: 'Payload fields', kind: 'number', get: (d) => d.payloadSchema.length },
    { key: 'description', label: 'Description', kind: 'text', get: (d) => d.description, sortable: false },
    { key: 'updated', label: 'Updated', kind: 'date', get: (d) => d.updatedAt },
    { key: 'created', label: 'Created', kind: 'date', get: (d) => d.createdAt },
  ],
});

/** Search and sort of the built-in shipment events (their own URL parameters, `b.q`, `b.sort`…). */
export const builtInEventList = (listeners: Record<string, Workflow[]>): ListConfig<EventOption> => ({
  noun: ['built-in event', 'built-in events'],
  searchPlaceholder: 'Search built-in events',
  searchText: (e) => `${e.label} ${e.value} ${e.description ?? ''}`,
  defaultSort: null,
  paramPrefix: 'b.',
  fields: [
    { key: 'name', label: 'Event', kind: 'text', get: (e) => e.label },
    { key: 'key', label: 'Key', kind: 'text', get: (e) => e.value },
    { key: 'starts', label: 'Workflows', kind: 'enum', quick: true, get: (e) => startsWorkflows(listeners[e.value]?.length ?? 0), options: STARTS_OPTIONS },
    { key: 'workflows', label: 'Starts', kind: 'number', get: (e) => listeners[e.value]?.length ?? 0 },
  ],
});
