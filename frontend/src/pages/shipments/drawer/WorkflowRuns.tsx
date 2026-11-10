import { ChevronRight, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState, Skeleton, StatusPill } from '../../../components/ui';
import { formatDuration, timeAgo } from '../../../lib/format';
import { useEventCatalog, useShipmentRuns, useWorkflowList } from '../hooks/useShipmentQueries';
import { REFERENCE_STALE_MS, WORKFLOWS_STALE_MS } from '../shipments.constants';
import { findEventLabel, publishedTriggered } from '../shipments.helpers';
import { ConnectedWorkflows } from './ConnectedWorkflows';
import type { RunItemProps, WorkflowRunsProps } from './drawer.types';

/** Every workflow execution this shipment went through, newest first. Rows open the execution graph. */
export function WorkflowRuns({ shipment, waiting }: WorkflowRunsProps) {
  const shipmentId = shipment.id;
  const navigate = useNavigate();
  const workflows = useWorkflowList({ staleTime: WORKFLOWS_STALE_MS });
  const eventCatalog = useEventCatalog({ staleTime: REFERENCE_STALE_MS });
  const runs = useShipmentRuns(shipmentId);

  return (
    <section>
      <div className="drawer-h-row">
        <h3 className="drawer-h">Workflow runs</h3>
        {(runs.data?.length ?? 0) > 0 && (
          <Link to={`/executions?shipmentId=${shipmentId}`} className="link-inline small">
            View all
          </Link>
        )}
      </div>
      {runs.isPending ? (
        <Skeleton h={56} />
      ) : runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
      ) : runs.data.length === 0 ? (
        <p className="muted small">
          {waiting
            ? 'No workflows have run yet — they start when the shipment is triggered.'
            : 'No workflow has run for this shipment yet — see which workflows are connected below and the event each one waits for.'}
        </p>
      ) : (
        <ul className="run-list">
          {runs.data.map((e) => (
            <RunItem key={e.id} run={e} onOpen={() => navigate(`/executions/${e.id}`)} />
          ))}
        </ul>
      )}
      <ConnectedWorkflows
        shipment={shipment}
        waiting={waiting}
        workflows={publishedTriggered(workflows.data)}
        ranIds={new Set((runs.data ?? []).map((e) => e.workflowId))}
        eventLabel={(key) => findEventLabel(eventCatalog.data, key) ?? key}
      />
    </section>
  );
}

function RunItem({ run: e, onOpen }: RunItemProps) {
  return (
    <li>
      <button className="run-row" onClick={onOpen} title="Open the execution graph">
        <StatusPill status={e.status} />
        <span className="run-main">
          <span className="run-name">
            {e.workflowName} <span className="muted mono small">v{e.workflowVersion}</span>
          </span>
          <span className="run-meta mono">
            {e.trigger.event} · {timeAgo(e.startedAt)}
            {e.durationMs !== null ? ` · ${formatDuration(e.durationMs)}` : ''}
          </span>
        </span>
        <ChevronRight size={15} className="run-chevron" />
      </button>
      <Link
        to={`/workflows/${e.workflowId}`}
        className="icon-btn run-workflow-link"
        title={`Open the ${e.workflowName} workflow`}
        aria-label={`Open the ${e.workflowName} workflow`}
      >
        <ExternalLink size={14} />
      </Link>
    </li>
  );
}
