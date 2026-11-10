import type { Workflow } from '../api/types';
import type { ListConfig } from '../components/list/list.types';
import { listStatusOf, triggerKindOf, workflowSearchText } from './Workflows.helpers';

/** Search, sort and filters of the Workflows list. */
export const WORKFLOW_LIST: ListConfig<Workflow> = {
  noun: ['workflow', 'workflows'],
  searchPlaceholder: 'Search name, description or trigger',
  searchText: workflowSearchText,
  defaultSort: { key: 'updated', dir: 'desc' },
  fields: [
    { key: 'name', label: 'Name', kind: 'text', get: (w) => w.name },
    {
      key: 'status',
      label: 'Status',
      kind: 'enum',
      quick: true,
      get: listStatusOf,
      options: [
        { value: 'published', label: 'Published' },
        { value: 'paused', label: 'Paused' },
        { value: 'draft', label: 'Draft' },
      ],
    },
    {
      key: 'trigger',
      label: 'Trigger',
      kind: 'enum',
      quick: true,
      get: (w) => triggerKindOf(w.triggerEvent),
      options: [
        { value: 'http', label: 'API request' },
        { value: 'event', label: 'Event' },
        { value: 'schedule', label: 'Schedule' },
        { value: 'record', label: 'Record changed' },
        { value: 'none', label: 'Not set' },
      ],
    },
    { key: 'event', label: 'Trigger key', kind: 'text', get: (w) => w.triggerEvent, sortable: false },
    { key: 'description', label: 'Description', kind: 'text', get: (w) => w.description, sortable: false },
    { key: 'live', label: 'Live version', kind: 'number', get: (w) => w.publishedVersion },
    { key: 'versions', label: 'Latest version', kind: 'number', get: (w) => w.latestVersion },
    { key: 'updated', label: 'Updated', kind: 'date', get: (w) => w.updatedAt },
    { key: 'created', label: 'Created', kind: 'date', get: (w) => w.createdAt },
  ],
};
