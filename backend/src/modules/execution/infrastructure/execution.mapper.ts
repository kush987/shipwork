import { omit, pickBy } from 'lodash';
import { toDateOrNull, toIso, toIsoOrNull } from '../../../shared/persistence/mongo-mapping';
import type { Execution, ExecutionFilter, NodeExecution } from '../domain/execution.types';
import type { ExecutionDoc, NodeExecutionDoc } from './execution.schema';

export const toExecution = (doc: ExecutionDoc): Execution => ({
  ...(omit(doc, ['_id', 'scheduledNodes', 'expiresAt']) as unknown as Omit<Execution, 'id'>),
  response: (doc.response as Execution['response']) ?? null,
  id: doc._id,
  startedAt: toIso(doc.startedAt),
  completedAt: toIsoOrNull(doc.completedAt),
});

export const toExecutionDoc = ({ id, startedAt, completedAt, ...rest }: Execution) => ({
  _id: id,
  ...rest,
  startedAt: new Date(startedAt),
  completedAt: toDateOrNull(completedAt),
  scheduledNodes: [],
});

export const toNodeExecution = ({ _id, expiresAt, ...doc }: NodeExecutionDoc): NodeExecution => ({
  ...doc,
  status: doc.status as NodeExecution['status'],
  startedAt: toIso(doc.startedAt),
  completedAt: toIsoOrNull(doc.completedAt),
});

export const toNodeExecutionDoc = (n: NodeExecution) => ({ ...n, startedAt: new Date(n.startedAt), completedAt: toDateOrNull(n.completedAt) });

/** One record per node of a run; retries overwrite it. */
export const nodeExecutionId = (n: Pick<NodeExecution, 'executionId' | 'nodeId'>) => `${n.executionId}:${n.nodeId}`;

/** Mongo query for a tenant's executions; unset filter fields don't constrain. */
export function toExecutionQuery(tenantId: string, { since, ...filter }: ExecutionFilter) {
  return { tenantId, ...pickBy(filter, Boolean), ...(since ? { startedAt: { $gte: since } } : {}) };
}
