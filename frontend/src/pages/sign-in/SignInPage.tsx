import { useQuery } from '@tanstack/react-query';
import { Fingerprint, KeyRound, Pencil, Plus, ScanSearch, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { AuthProvider } from '../../api/types';
import { useCan } from '../../auth/useAccess';
import { ListEmpty } from '../../components/list/ListEmpty';
import { ListToolbar } from '../../components/list/ListToolbar';
import { SortHeader } from '../../components/list/SortHeader';
import { useList } from '../../components/list/useList';
import { Badge, Button, EmptyState, ErrorState, PageHeader, TableSkeleton } from '../../components/ui';
import { pluralize, timeAgo } from '../../lib/format';
import { PROVIDER_BADGE_TONE, PROVIDER_TYPE_LABEL } from './sign-in.constants';
import { useDeleteProvider } from './hooks';
import { PROVIDER_LIST } from './sign-in.list';
import { ProviderModal } from './ProviderModal';
import { TestTokenModal } from './TestTokenModal';
import { TokenCheckModal } from './TokenCheckModal';
import type { ProviderRowProps } from './sign-in.types';

/** Settings → App sign-in: how JWT endpoints recognise your app's signed-in users. */
export function SignInPage() {
  const providers = useQuery({ queryKey: queryKeys.authProviders, queryFn: api.listAuthProviders });
  const editable = useCan('auth-providers:write');
  const [editing, setEditing] = useState<AuthProvider | null | 'new'>(null);
  const [checking, setChecking] = useState<AuthProvider | null>(null);
  const [testing, setTesting] = useState<AuthProvider | null>(null);
  const list = useList(providers.data, PROVIDER_LIST);

  const newButton = editable && (
    <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
      New provider
    </Button>
  );
  return (
    <div className="page">
      <PageHeader
        title="App sign-in"
        subtitle={
          <>
            How endpoints with JWT authentication recognise your app’s users. The signed-in user reaches workflows as{' '}
            <span className="mono">request.auth</span> (id, roles, claims).{' '}
            <Link to="/endpoints" className="link-inline">
              Endpoints
            </Link>{' '}
            pick a provider under Authentication.
          </>
        }
        actions={newButton}
      />

      {list.total > 0 && <ListToolbar list={list} />}
      {providers.isLoading ? (
        <TableSkeleton rows={3} cols={5} />
      ) : providers.isError ? (
        <ErrorState error={providers.error} onRetry={() => providers.refetch()} />
      ) : list.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={Fingerprint}
            title="No sign-in providers yet"
            description="Add “ShipFlow-issued” to sign users in with your own Login API (the Login API template does the rest), or connect Auth0, Firebase, Cognito or Keycloak."
            action={newButton || undefined}
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
                <SortHeader list={list} field="issuer" />
                <SortHeader list={list} field="endpoints" className="num" />
                <SortHeader list={list} field="updated" />
                <th />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((p) => (
                <ProviderRow
                  key={p.id}
                  provider={p}
                  canEdit={editable}
                  onEdit={() => setEditing(p)}
                  onCheck={() => setChecking(p)}
                  onTestToken={() => setTesting(p)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProviderModal open={editing !== null} provider={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <TokenCheckModal provider={checking} onClose={() => setChecking(null)} />
      <TestTokenModal provider={testing} onClose={() => setTesting(null)} />
    </div>
  );
}

function ProviderRow({ provider: p, canEdit: editable, onEdit, onCheck, onTestToken }: ProviderRowProps) {
  const remove = useDeleteProvider();
  return (
    <tr>
      <td>
        <div className="cell-primary">{p.name}</div>
        <Badge tone={PROVIDER_BADGE_TONE[p.type]}>{PROVIDER_TYPE_LABEL[p.type]}</Badge>
      </td>
      <td className="mono small provider-issuer" title={p.issuer}>
        {p.issuer}
      </td>
      <td className="num">{p.endpointCount ? pluralize(p.endpointCount, 'endpoint') : <span className="muted">—</span>}</td>
      <td className="small muted">{timeAgo(p.updatedAt)}</td>
      <td className="num">
        <div className="row-actions">
          <Button size="sm" variant="ghost" icon={ScanSearch} onClick={onCheck}>
            Check a token
          </Button>
          {p.type === 'shipflow' && editable && (
            <Button size="sm" variant="ghost" icon={KeyRound} onClick={onTestToken}>
              Test token
            </Button>
          )}
          {editable && (
            <>
              <button type="button" className="icon-btn" aria-label={`Edit ${p.name}`} onClick={onEdit}>
                <Pencil size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${p.name}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`Delete “${p.name}”? Tokens it verified will stop working on its endpoints.`)) remove.mutate(p);
                }}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
