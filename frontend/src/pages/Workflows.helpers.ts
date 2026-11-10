import type { Workflow } from '../api/types';
import { triggerLabel } from '../lib/format';
import type { TriggerFilter, WorkflowStatusFilter } from './Workflows.types';

/** What kind of trigger starts a workflow, for the Trigger filter. */
export function triggerKindOf(event: string | null): TriggerFilter {
  if (!event) return 'none';
  if (event === 'http.request') return 'http';
  if (event === 'schedule') return 'schedule';
  if (event.startsWith('record:')) return 'record';
  return 'event';
}

/** The status the list shows: paused is a published workflow that no trigger starts. */
export const listStatusOf = (w: Workflow): WorkflowStatusFilter => (w.paused ? 'paused' : w.status === 'published' ? 'published' : 'draft');

/** The text the list search looks in. */
export const workflowSearchText = (w: Workflow) => [w.name, w.description, w.triggerEvent, triggerLabel(w.triggerEvent)].join(' ');
