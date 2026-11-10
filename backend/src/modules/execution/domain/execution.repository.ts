import { Execution, NodeExecution, ExecutionFilter } from './execution.types';
import type { WorkflowResponse } from '../../nodes/domain/workflow-node.types';

export abstract class ExecutionRepository {
  /** False (and nothing written) when a run with this id already exists. */
  abstract create(execution: Execution): Promise<boolean>;
  abstract findById(tenantId: string, id: string): Promise<Execution | null>;
  abstract list(tenantId: string, filter: ExecutionFilter, limit: number): Promise<Execution[]>;
  abstract count(tenantId: string, filter: ExecutionFilter): Promise<number>;

  /** Atomically marks a node as scheduled. Returns false if it was already scheduled or the run ended. */
  abstract claimNode(id: string, nodeId: string): Promise<boolean>;
  /** Decrements the outstanding-step counter and returns what remains. */
  abstract completeStep(id: string): Promise<number>;
  abstract mergeContext(id: string, patch: Record<string, unknown>): Promise<void>;
  /** Sets the shipment later steps of the run work on. */
  abstract attachShipment(id: string, shipmentId: string): Promise<void>;
  /** Stores the run's response unless one is already set. Returns true when this call set it. */
  abstract setResponse(id: string, response: WorkflowResponse): Promise<boolean>;
  abstract setStatus(id: string, status: 'running' | 'waiting'): Promise<void>;
  /** Moves an active execution to a terminal state. No-op if it already finished. */
  abstract finish(id: string, status: 'succeeded' | 'failed', error?: string): Promise<void>;

  abstract saveNodeExecution(nodeExecution: NodeExecution): Promise<void>;
  abstract listNodeExecutions(executionIds: string[]): Promise<NodeExecution[]>;
}
