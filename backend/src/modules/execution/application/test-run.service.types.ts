import { StartExecutionInput } from './execution-engine.types';
import { ExecutionStatus } from '../domain/execution.types';
import { WorkflowResponse } from '../../nodes/domain/workflow-node.types';
import type { RawRequest } from '../../nodes/domain/triggers.types';
import { NewShipmentInput } from '../../shipment/application/shipment.service.types';

export interface TestRunInput {
  /** Event-triggered workflows: the shipment to create in the sandbox. */
  payload?: NewShipmentInput;
  /** API-triggered workflows: the request to simulate. */
  request?: RawRequest;
  /** Record-triggered workflows: the change to pretend happened (nothing is written). */
  change?: { operation?: 'created' | 'updated' | 'deleted'; record?: Record<string, unknown>; previous?: Record<string, unknown>; changedFields?: string[] };
  version?: number;
}

export interface TestRunResult {
  executionId: string;
  status?: ExecutionStatus;
  response?: WorkflowResponse | null;
}

export type RunBase = Omit<StartExecutionInput, 'trigger' | 'shipmentId'>;

export type TestStrategy = (base: RunBase, input: TestRunInput) => Promise<TestRunResult>;
