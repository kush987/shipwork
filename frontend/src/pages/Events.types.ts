import type { EventDefinition, Workflow } from '../api/types';

/** What the event modal edits: an existing definition, a new one, or nothing (closed). */
export type EventModalTarget = EventDefinition | 'new' | null;

export interface WorkflowLinksProps {
  flows: Workflow[];
}

export interface EventModalProps {
  target: EventModalTarget;
  onClose: () => void;
}
