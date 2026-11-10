import type { Execution, NodeExecution, WorkflowResponse } from '../api/types';

export interface ExecSummaryProps {
  ex: Execution;
}

export interface TimelineTriggerProps {
  ex: Execution;
}

export interface TimelineResponseProps {
  response: WorkflowResponse;
}

export interface TimelineItemProps {
  n: NodeExecution;
  category?: string;
  icon?: string;
  focused: boolean;
  onFocus: () => void;
}
