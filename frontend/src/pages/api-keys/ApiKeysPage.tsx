import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { ApiKey, CreatedApiKey } from '../../api/types';
import { ListEmpty } from '../../components/list/ListEmpty';
import { ListToolbar } from '../../components/list/ListToolbar';
import { SortHeader } from '../../components/list/SortHeader';
import { useList } from '../../components/list/useList';
import { OneTimeSecretModal } from '../../components/OneTimeSecretModal';
import { Badge, Button, EmptyState, ErrorState, PageHeader, TableSkeleton } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { formatDateTime, pluralize, timeAgo } from '../../lib/format';
import type { ScopeCellProps, SecretModalProps } from './api-keys.types';
import { CreateKeyModal } from './CreateKeyModal';
import { EditScopeModal } from './EditScopeModal';
import { scopeRoutes } from './api-keys.helpers';
import { apiKeyList } from './api-keys.list';
import { useEndpoints } from '../endpoints/hooks';

export function ApiKeysPage() {
  const keys = useQuery({ queryKey: queryKeys.apiKeys, queryFn: api.listApiKeys });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [scoping, setScoping] = useState<ApiKey | null>(null);
  const endpoints = useEndpoints();
  const qc = useQueryClient();
  const toast = useToast();

  const revoke = useMutation({
    mutationFn: (k: ApiKey) => api.revokeApiKey(k.id),
    onSuccess: (_, k) => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys });
      toast.success(`${k.name} revoked`, 'Calls using it now get 401.');
    },
    onError: (e: Error) => toast.error('Could not revoke key', e.message),
  });

  const config = useMemo(() => apiKeyList(endpoints.data), [endpoints.data]);
  const list = useList(keys.data, config);
  return (
    <div className="page">
      <PageHeader
        title="API keys"
        subtitle={
          <>
            Secrets your apps send as <span className="mono">x-api-key</span> to call{' '}
            <Link to="/endpoints" className="link-inline">
              endpoints
            </Link>{' '}
            that require a key.
          </>
        }
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New API key
          </Button>
        }
      />

      {list.total > 0 && <ListToolbar list={list} />}
      {keys.isLoading ? (
        <TableSkeleton rows={3} cols={5} />
      ) : keys.isError ? (
        <ErrorState error={keys.error} onRetry={() => keys.refetch()} />
      ) : list.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Create one key per app or environment, so you can revoke one without breaking the others."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                New API key
              </Button>
            }
          />
        </div>
      ) : list.rows.length === 0 ? (
        <ListEmpty list={list} />
      ) : (
        <div className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                <SortHeader list={list} field="name" />
                <SortHeader list={list} field="prefix" />
                <SortHeader list={list} field="endpoints" label="May call" />
                <SortHeader list={list} field="created" />
                <SortHeader list={list} field="used" />
                <SortHeader list={list} field="status" />
                <th />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((k) => (
                <tr key={k.id} className={k.revoked ? 'is-revoked' : undefined}>
                  <td className="cell-primary">{k.name}</td>
                  <td className="mono small">{k.prefix}…</td>
                  <td>
                    <ScopeCell apiKey={k} endpoints={endpoints.data} />
                  </td>
                  <td className="small muted" title={formatDateTime(k.createdAt)}>
                    {timeAgo(k.createdAt)}
                  </td>
                  <td className="small muted" title={k.lastUsedAt ? formatDateTime(k.lastUsedAt) : undefined}>
                    {k.lastUsedAt ? timeAgo(k.lastUsedAt) : 'Never'}
                  </td>
                  <td>{k.revoked ? <Badge tone="neutral">Revoked</Badge> : <Badge tone="success" dot>Active</Badge>}</td>
                  <td className="num">
                    {!k.revoked && (
                      <div className="row-actions">
                        <Button size="sm" variant="ghost" onClick={() => setScoping(k)}>
                          Scope
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={revoke.isPending && revoke.variables?.id === k.id}
                          onClick={() => {
                            if (confirm(`Revoke “${k.name}”? Apps using it will get 401 immediately. This can't be undone.`)) revoke.mutate(k);
                          }}
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateKeyModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          setCreated(c);
        }}
      />
      <SecretModal created={created} onClose={() => setCreated(null)} />
      <EditScopeModal apiKey={scoping} onClose={() => setScoping(null)} />
    </div>
  );
}

/** "All API-key endpoints", or how many — with the routes on hover. */
function ScopeCell({ apiKey, endpoints }: ScopeCellProps) {
  if (apiKey.endpointIds === null) return <span className="small muted">All API-key endpoints</span>;
  const routes = scopeRoutes(apiKey, endpoints);
  return (
    <span className="small" title={routes.join('\n')}>
      {pluralize(apiKey.endpointIds.length, 'endpoint')}
    </span>
  );
}

/** Shows a new key's secret exactly once. */
function SecretModal({ created, onClose }: SecretModalProps) {
  return (
    <OneTimeSecretModal
      secret={created?.secret ?? null}
      title={`“${created?.apiKey.name}” created`}
      description="Copy the key now and store it somewhere safe."
      warning="This is the only time the full key is shown. If you lose it, revoke it and create a new one."
      copyLabel="Copy key"
      onClose={onClose}
    >
      <p className="muted small" style={{ margin: 0 }}>
        Send it as <span className="mono">x-api-key: {created?.apiKey.prefix}…</span> or <span className="mono">Authorization: Bearer …</span>. Keep it on
        your server — don't ship it in browser code.
      </p>
    </OneTimeSecretModal>
  );
}
