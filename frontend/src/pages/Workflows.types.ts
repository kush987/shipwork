import type { Workflow } from '../api/types';

export interface VersionSummaryProps {
  w: Workflow;
}

export interface CreateWorkflowModalProps {
  open: boolean;
  onClose: () => void;
}

export type TriggerFilter = 'http' | 'schedule' | 'record' | 'event' | 'none';

export type WorkflowStatusFilter = 'draft' | 'published' | 'paused';
