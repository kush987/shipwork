import type { ExecutionStatus } from '../api/types';

/** Status filter buttons; '' is "All". */
export const STATUS_FILTERS: (ExecutionStatus | '')[] = ['', 'queued', 'running', 'waiting', 'succeeded', 'failed'];

/** Poll faster while any listed run is still in flight. */
export const EXECUTIONS_ACTIVE_REFETCH_MS = 2000;
export const EXECUTIONS_IDLE_REFETCH_MS = 8000;
