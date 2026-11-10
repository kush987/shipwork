import { useQuery } from '@tanstack/react-query';
import { Activity, Boxes, RefreshCw, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ExecutionStatus } from '../api/types';
import { ExecutionsTable } from '../components/ExecutionsTable';
import { ListEmpty } from '../components/list/ListEmpty';
import { ListToolbar } from '../components/list/ListToolbar';
import { useList } from '../components/list/useList';
import { Button, EmptyState, ErrorState, PageHeader, TableSkeleton } from '../components/ui';
import { ACTIVE_EXECUTION_STATUSES } from '../lib/executions.constants';
import { EXECUTIONS_ACTIVE_REFETCH_MS, EXECUTIONS_IDLE_REFETCH_MS, STATUS_FILTERS } from './Executions.constants';
import { EXECUTION_LIST } from './Executions.list';

export function ExecutionsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as ExecutionStatus | '';
  const workflowId = params.get('workflowId') ?? '';
  const shipmentId = params.get('shipmentId') ?? '';
  const shipment = useQuery({ queryKey: ['shipment', shipmentId], queryFn: () => api.getShipment(shipmentId), enabled: !!shipmentId });

  const workflows = useQuery({ queryKey: ['workflows'], queryFn: api.listWorkflows });
  const executions = useQuery({
    queryKey: ['executions', { status, workflowId, shipmentId }],
    queryFn: () => api.listExecutions({ status, workflowId: workflowId || undefined, shipmentId: shipmentId || undefined }),
    refetchInterval: (q) =>
      q.state.data?.some((e) => ACTIVE_EXECUTION_STATUSES.includes(e.status)) ? EXECUTIONS_ACTIVE_REFETCH_MS : EXECUTIONS_IDLE_REFETCH_MS,
  });

  const list = useList(executions.data, EXECUTION_LIST);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader
        title="Executions"
        subtitle="Every workflow run, node by node. Runs are pinned to the version that started them."
        actions={
          <Button icon={RefreshCw} onClick={() => executions.refetch()} loading={executions.isFetching && !executions.isLoading}>
            Refresh
          </Button>
        }
      />

      <div className="toolbar executions-server-filters">
        <div className="segmented" role="group" aria-label="Status">
          {STATUS_FILTERS.map((s) => (
            <button key={s || 'all'} type="button" className={status === s ? 'on' : ''} onClick={() => setParam('status', s)}>
              {s ? s : 'All'}
            </button>
          ))}
        </div>
        <select className="input input-inline" aria-label="Workflow" value={workflowId} onChange={(e) => setParam('workflowId', e.target.value)}>
          <option value="">All workflows</option>
          {workflows.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        {shipmentId && (
          <span className="filter-chip">
            <Boxes size={13} />
            Shipment <span className="mono">{shipment.data?.orderId ?? shipmentId}</span>
            <button aria-label="Clear shipment filter" onClick={() => setParam('shipmentId', '')}>
              <X size={12} />
            </button>
          </span>
        )}
      </div>
      {list.total > 0 && <ListToolbar list={list} />}

      {executions.isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : executions.isError ? (
        <ErrorState error={executions.error} onRetry={() => executions.refetch()} />
      ) : (executions.data?.length ?? 0) === 0 ? (
        <div className="card">
          <EmptyState
            icon={Activity}
            title={status || workflowId || shipmentId ? 'No executions match these filters' : 'No executions yet'}
            description={
              status || workflowId
                ? 'Try clearing the filters.'
                : 'Executions appear when a shipment event triggers a published workflow, or when you test-run a draft.'
            }
          />
        </div>
      ) : list.rows.length === 0 ? (
        <ListEmpty list={list} />
      ) : (
        <div className="card">
          <ExecutionsTable executions={list.rows} list={list} />
        </div>
      )}
    </div>
  );
}
