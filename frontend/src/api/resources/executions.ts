import { request } from '../http';
import { qs } from '../http.helpers';
import type { Execution, ExecutionListParams, ExecutionWithDefinition, ReplayResult } from '../types';

export const executionsApi = {
  listExecutions: (p: ExecutionListParams = {}) => request<Execution[]>('GET', `/executions${qs({ limit: 50, ...p })}`),
  getExecution: (id: string) => request<ExecutionWithDefinition>('GET', `/executions/${id}`),
  replay: (id: string) => request<ReplayResult>('POST', `/executions/${id}/replay`),
};
