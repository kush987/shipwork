// Executions (docs/API_CONTRACT.md).
import type { WorkflowDefinition, WorkflowResponse } from './workflows.types';

export type ExecutionStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed';

export type ExecutionMode = 'trigger' | 'test' | 'replay' | 'manual' | 'api' | 'schedule';

export interface NodeExecution {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: 'running' | 'succeeded' | 'failed' | 'retrying';
  input: unknown;
  output: unknown;
  error: string | null;
  outputHandle: string | null;
  attempt: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

export interface Execution {
  id: string;
  tenantId: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  /** manual = started from the shipment page rather than by its event; api = started by an endpoint call. */
  mode: ExecutionMode;
  status: ExecutionStatus;
  trigger: { event: string; data: unknown };
  context: Record<string, unknown>;
  error: string | null;
  traceId: string;
  /** Set by the first "Return response" step. */
  response: WorkflowResponse | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  nodeExecutions: NodeExecution[];
}

/** Filters of GET /executions. */
export interface ExecutionListParams {
  workflowId?: string;
  shipmentId?: string;
  status?: ExecutionStatus | '';
  limit?: number;
}

/** GET /executions/:id — the run and the workflow version it ran. */
export interface ExecutionWithDefinition {
  execution: Execution;
  definition: WorkflowDefinition;
}

export interface ReplayResult {
  executionId: string;
}
