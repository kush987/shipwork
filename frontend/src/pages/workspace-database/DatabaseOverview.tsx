import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../components/ui';
import { formatDateTime, timeAgo } from '../../lib/format';
import { MODE_HELP, MODE_LABELS } from './database.constants';
import { totalDocuments } from './database.helpers';
import type { DatabaseOverviewProps } from './database.types';

/** Where the workspace's business data lives right now, and how much of it there is. */
export function DatabaseOverview({ database: db }: DatabaseOverviewProps) {
  const ok = db.status === 'ok';
  return (
    <section className="card panel-card">
      <header className="panel-card-head">
        <h2 className="section-title">Current database</h2>
        <Badge tone={db.mode === 'managed' ? 'accent' : 'violet'}>{MODE_LABELS[db.mode]}</Badge>
      </header>
      <div className="panel-card-body">
        <p className="muted small db-mode-help">{MODE_HELP[db.mode]}</p>
        <dl className="db-facts">
          <dt>Database</dt>
          <dd className="mono">{db.databaseName}</dd>
          <dt>Host</dt>
          <dd className={db.mode === 'external' ? 'mono' : undefined}>{db.host}</dd>
          <dt>Status</dt>
          <dd>
            {ok ? (
              <span className="db-status is-ok">
                <CheckCircle2 size={14} aria-hidden /> Connected
              </span>
            ) : (
              <span className="db-status is-down">
                <AlertTriangle size={14} aria-hidden /> Unreachable
              </span>
            )}
          </dd>
          {db.connectedAt && (
            <>
              <dt>Connected</dt>
              <dd title={formatDateTime(db.connectedAt)}>{timeAgo(db.connectedAt)}</dd>
            </>
          )}
        </dl>
        {!ok && db.error && (
          <div className="auth-error" role="alert">
            {db.error}
          </div>
        )}
        <div className="table-scroll">
          <table className="table db-collections">
            <thead>
              <tr>
                <th>Business data</th>
                <th className="num">Documents</th>
              </tr>
            </thead>
            <tbody>
              {db.collections.map((c) => (
                <tr key={c.name}>
                  <td>
                    <div className="cell-primary">{c.label}</div>
                    <div className="cell-secondary mono">{c.name}</div>
                  </td>
                  <td className="num mono">{c.documents.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num mono">{totalDocuments(db.collections).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
