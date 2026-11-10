import { useNavigate } from 'react-router-dom';
import { formatDuration, shortId, timeAgo, triggerLabel } from '../lib/format';
import type { ExecutionsTableProps } from './ExecutionsTable.types';
import { SortHeader } from './list/SortHeader';
import { ModeBadge } from './ModeBadge';
import { StatusPill } from './ui';

export function ExecutionsTable({ executions, compact, list }: ExecutionsTableProps) {
  const navigate = useNavigate();
  // A plain function (not a component), so the headers keep focus when they re-render.
  const th = (field: string, label: string, className?: string) =>
    list ? <SortHeader list={list} field={field} label={label} className={className} /> : <th className={className}>{label}</th>;
  return (
    <table className="table table-hover">
      <thead>
        <tr>
          {th('status', 'Status')}
          {th('workflow', 'Workflow')}
          {!compact && th('mode', 'Mode')}
          {th('trigger', 'Trigger')}
          {!compact && th('steps', 'Nodes')}
          {th('duration', 'Duration', 'num')}
          {th('started', 'Started', 'num')}
        </tr>
      </thead>
      <tbody>
        {executions.map((e) => {
          const failedNodes = e.nodeExecutions.filter((n) => n.status === 'failed').length;
          return (
            <tr key={e.id} onClick={() => navigate(`/executions/${e.id}`)} className="clickable">
              <td>
                <StatusPill status={e.status} />
              </td>
              <td>
                <div className="cell-primary">{e.workflowName}</div>
                <div className="cell-secondary mono">
                  v{e.workflowVersion} · {shortId(e.id)}
                </div>
              </td>
              {!compact && (
                <td>
                  <ModeBadge mode={e.mode} />
                </td>
              )}
              <td>
                <span className="mono small">{triggerLabel(e.trigger?.event)}</span>
              </td>
              {!compact && (
                <td>
                  <span className="small">
                    {e.nodeExecutions.length} run
                    {failedNodes > 0 && <span className="text-danger"> · {failedNodes} failed</span>}
                  </span>
                </td>
              )}
              <td className="num mono small">{formatDuration(e.durationMs)}</td>
              <td className="num small muted" title={e.startedAt}>
                {timeAgo(e.startedAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

