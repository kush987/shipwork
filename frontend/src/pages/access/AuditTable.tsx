import { MethodBadge } from '../../components/MethodBadge';
import { Badge } from '../../components/ui';
import { formatDateTime, timeAgo } from '../../lib/format';
import { SortHeader } from '../../components/list/SortHeader';
import type { AuditTableProps } from './access.types';

export function AuditTable({ events, list }: AuditTableProps) {
  return (
    <div className="card table-scroll">
      <table className="table audit-table">
        <thead>
          <tr>
            <SortHeader list={list} field="time" />
            <SortHeader list={list} field="who" />
            <SortHeader list={list} field="action" />
            <SortHeader list={list} field="resource" />
            <SortHeader list={list} field="path" />
            <SortHeader list={list} field="decision" />
            <SortHeader list={list} field="status" className="num" />
            <SortHeader list={list} field="reason" />
            <SortHeader list={list} field="ip" />
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td className="small" title={formatDateTime(e.at)}>
                {timeAgo(e.at)}
              </td>
              <td className="small">{e.actor?.email ?? <span className="muted">—</span>}</td>
              <td className="mono small">{e.action}</td>
              <td className="mono small">{e.resource}</td>
              <td className="small">
                <span className="audit-request">
                  <MethodBadge method={e.method} />
                  <span className="mono">{e.path}</span>
                </span>
              </td>
              <td>
                <Badge tone={e.decision === 'allowed' ? 'success' : 'danger'} dot>
                  {e.decision === 'allowed' ? 'Allowed' : 'Denied'}
                </Badge>
              </td>
              <td className="num small">{e.status ?? '—'}</td>
              <td className="small audit-reason">{e.reason || <span className="muted">—</span>}</td>
              <td className="mono small muted">{e.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
