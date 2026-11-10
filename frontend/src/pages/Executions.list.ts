import type { Execution, ExecutionMode } from '../api/types';
import { EXECUTION_MODE_BADGE } from '../components/ModeBadge.constants';
import type { ListConfig } from '../components/list/list.types';
import { triggerLabel } from '../lib/format';

const failedSteps = (e: Execution) => e.nodeExecutions.filter((n) => n.status === 'failed').length;

/**
 * Search, sort and filters on the runs loaded (status, workflow and shipment are asked of the server;
 * these narrow what came back).
 */
export const EXECUTION_LIST: ListConfig<Execution> = {
  noun: ['run', 'runs'],
  searchPlaceholder: 'Search workflow, run id, trigger or error',
  searchText: (e) => [e.workflowName, e.id, e.trigger?.event, triggerLabel(e.trigger?.event), e.error].join(' '),
  defaultSort: { key: 'started', dir: 'desc' },
  fields: [
    {
      key: 'status',
      label: 'Status',
      kind: 'enum',
      get: (e) => e.status,
      options: ['queued', 'running', 'waiting', 'succeeded', 'failed'].map((s) => ({ value: s, label: s })),
    },
    { key: 'workflow', label: 'Workflow', kind: 'text', get: (e) => e.workflowName },
    { key: 'version', label: 'Version', kind: 'number', get: (e) => e.workflowVersion },
    {
      key: 'mode',
      label: 'Mode',
      kind: 'enum',
      quick: true,
      get: (e) => e.mode,
      options: (Object.keys(EXECUTION_MODE_BADGE) as ExecutionMode[]).map((m) => ({ value: m, label: EXECUTION_MODE_BADGE[m].label })),
    },
    { key: 'trigger', label: 'Trigger', kind: 'text', get: (e) => triggerLabel(e.trigger?.event) },
    { key: 'steps', label: 'Steps run', kind: 'number', get: (e) => e.nodeExecutions.length },
    { key: 'failedSteps', label: 'Failed steps', kind: 'number', get: failedSteps },
    { key: 'duration', label: 'Duration (ms)', kind: 'number', get: (e) => e.durationMs },
    { key: 'response', label: 'Response status', kind: 'number', get: (e) => e.response?.statusCode },
    { key: 'error', label: 'Error', kind: 'text', get: (e) => e.error, sortable: false },
    { key: 'started', label: 'Started', kind: 'date', get: (e) => e.startedAt },
    { key: 'finished', label: 'Finished', kind: 'date', get: (e) => e.completedAt },
  ],
};
