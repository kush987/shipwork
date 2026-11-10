import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, Boxes, CircleCheck, Database, Rocket, Send, Webhook, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ExecutionsTable } from '../components/ExecutionsTable';
import { EmptyState, ErrorState, PageHeader, Skeleton, TableSkeleton } from '../components/ui';
import { STATS_REFETCH_MS } from './Dashboard.constants';
import { formatSuccessRate } from './Dashboard.helpers';

export function DashboardPage() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: STATS_REFETCH_MS });
  const s = stats.data;

  const tiles = [
    { label: 'Workflows', value: s?.workflows, icon: Workflow, to: '/workflows' },
    { label: 'Published', value: s?.published, icon: Rocket, to: '/workflows' },
    { label: 'Executions · 24h', value: s?.executions24h, icon: Activity, to: '/executions' },
    {
      label: 'Success rate',
      value: s ? formatSuccessRate(s.successRate) : undefined,
      icon: CircleCheck,
      to: '/executions',
      meter: s?.successRate,
    },
    { label: 'Endpoints', value: s?.endpoints, icon: Webhook, to: '/endpoints' },
    { label: 'API calls · 24h', value: s?.apiCalls24h, icon: Send, to: '/executions' },
    { label: 'Collections', value: s?.collections, icon: Database, to: '/data' },
    { label: 'Shipments', value: s?.shipments, icon: Boxes, to: '/shipments' },
  ];

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle="How your workflows, APIs and courier automations are running right now." />

      {stats.isError && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}

      <div className="kpi-grid">
        {tiles.map((t) => (
          <Link to={t.to} key={t.label} className="kpi">
            <div className="kpi-top">
              <span className="kpi-label">{t.label}</span>
              <t.icon size={16} className="kpi-icon" />
            </div>
            <div className="kpi-value">{stats.isLoading ? <Skeleton w={56} h={26} /> : (t.value ?? '—')}</div>
            {t.meter !== undefined && (
              <div className="meter">
                <span style={{ width: `${Math.round(t.meter * 100)}%` }} />
              </div>
            )}
          </Link>
        ))}
      </div>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Recent executions</h2>
          <Link to="/executions" className="link-inline">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {stats.isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : s && s.recentExecutions.length > 0 ? (
          <div className="card">
            <ExecutionsTable executions={s.recentExecutions} compact />
          </div>
        ) : (
          !stats.isError && (
            <div className="card">
              <EmptyState
                icon={Activity}
                title="No executions yet"
                description="Publish a workflow and create a shipment to see your automations run here."
                action={
                  <Link to="/workflows" className="btn btn-primary btn-md">
                    Go to workflows
                  </Link>
                }
              />
            </div>
          )
        )}
      </section>
    </div>
  );
}
