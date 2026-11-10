import { ExecutionMode } from '../domain/execution.types';
import { WorkflowResponse } from '../../nodes/domain/workflow-node.types';
import { WorkflowDefinition } from '../../workflow/domain/workflow-definition.types';

export interface StartExecutionInput {
  /** A deterministic id makes starting idempotent (a retried event starts its run once). */
  id?: string;
  tenantId: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  definition: WorkflowDefinition;
  trigger: { event: string; data: unknown };
  shipmentId: string | null;
  mode: ExecutionMode;
}

/** What one step produced that callers outside the engine care about. */
export interface StepOutcome {
  /** Set when this step produced the run's HTTP response (the first response of a run wins). */
  response?: WorkflowResponse;
}
