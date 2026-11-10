import { ExecutionStatus } from '../domain/execution.types';
import type { WorkflowResponse } from '../../nodes/domain/workflow-node.types';

export type SyncRunResult =
  /** A "Return response" step ran; later steps may still be running in the background. */
  | { kind: 'response'; executionId: string; response: WorkflowResponse }
  /** The run finished without producing a response. */
  | { kind: 'completed'; executionId: string; status: Extract<ExecutionStatus, 'succeeded' | 'failed'>; error: string | null }
  | { kind: 'timeout'; executionId: string; timeoutMs: number };
