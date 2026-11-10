import type { WorkflowResponse } from '../../nodes/domain/workflow-node.types';
import type { WorkflowDefinition } from '../../workflow/domain/workflow-definition.types';

export type ExecutionStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed';

/**
 * trigger = started by its event · test = from the builder · replay = re-run of an earlier run ·
 * manual = from a shipment's page · api = by an endpoint call · schedule = by its schedule.
 */
export type ExecutionMode = 'trigger' | 'test' | 'replay' | 'manual' | 'api' | 'schedule';

export type NodeExecutionStatus = 'running' | 'succeeded' | 'failed' | 'retrying';

export interface Execution {
  id: string;
  tenantId: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  mode: ExecutionMode;
  status: ExecutionStatus;
  trigger: { event: string; data: unknown };
  shipmentId: string | null;
  /** Snapshot of the graph at start — executions are reproducible even if a draft changes later. */
  definition: WorkflowDefinition;
  context: Record<string, unknown>;
  /** Set by the first "Return response" step; what an API caller received. */
  response: WorkflowResponse | null;
  error: string | null;
  traceId: string;
  pendingSteps: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

export interface NodeExecution {
  executionId: string;
  tenantId: string;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: NodeExecutionStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  outputHandle: string | null;
  attempt: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

export interface ExecutionFilter {
  workflowId?: string;
  shipmentId?: string;
  status?: ExecutionStatus;
  mode?: ExecutionMode;
  since?: Date;
}

/** Port for running a node later/elsewhere. BullMQ implements it for async runs; sync runs use an in-process one. */
export interface StepJob {
  tenantId: string;
  executionId: string;
  nodeId: string;
}

/** How many days finished runs are kept, by kind of run. */
export interface RetentionPolicy {
  /** Runs started by API endpoints, and test runs. */
  apiDays: number;
  /** Every other run. */
  defaultDays: number;
}
