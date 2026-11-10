import { omit } from 'lodash';
import type { Execution, NodeExecution } from '../domain/execution.types';
import type { ExecutionView } from './execution.service.types';

/** What the API shows: the run plus its steps, without engine internals. */
export const toExecutionView = (execution: Execution, nodeExecutions: NodeExecution[]): ExecutionView => ({
  ...omit(execution, ['definition', 'pendingSteps']),
  nodeExecutions,
});

/** Correlation fields put on every engine log line. */
export const traceOf = (execution: Execution) => ({
  traceId: execution.traceId,
  executionId: execution.id,
  workflowId: execution.workflowId,
  version: execution.workflowVersion,
  tenantId: execution.tenantId,
});
