import { useMutation } from '@tanstack/react-query';
import { FileDown, Plus, Webhook } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { getAuth } from '../../auth/auth-store';
import { CopyButton } from '../../components/CopyButton';
import { ListEmpty } from '../../components/list/ListEmpty';
import { ListToolbar } from '../../components/list/ListToolbar';
import { SortHeader } from '../../components/list/SortHeader';
import { useList } from '../../components/list/useList';
import { MethodBadge } from '../../components/MethodBadge';
import { Badge, Button, EmptyState, ErrorState, PageHeader, TableSkeleton, Toggle } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { downloadJson } from '../../lib/download';
import { toEndpointInput } from '../../lib/endpoints';
import { curlSnippet } from './endpoints.helpers';
import { ENDPOINT_LIST } from './endpoints.list';
import type { EndpointRowProps } from './endpoints.types';
import { ReadyBadge, WorkflowLink } from './EndpointStatus';
import { useEndpoints, useUpdateEndpoint } from './hooks';
import { NewEndpointModal } from './NewEndpointModal';
import { AUTH_LABEL } from './endpoints.constants';

export function EndpointsPage() {
  const endpoints = useEndpoints();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const list = useList(endpoints.data, ENDPOINT_LIST);

  return (
    <div className="page">
      <PageHeader
        title="Endpoints"
        subtitle="Build an API without a backend: each endpoint runs a workflow, and its “Return response” step answers the caller."
        actions={
          <>
            <OpenApiButton />
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New endpoint
            </Button>
          </>
        }
      />

      {list.total > 0 && <ListToolbar list={list} />}

      {endpoints.isLoading ? (
        <TableSkeleton rows={4} cols={7} />
      ) : endpoints.isError ? (
        <ErrorState error={endpoints.error} onRetry={() => endpoints.refetch()} />
      ) : list.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={Webhook}
            title="Create your first endpoint"
            description="Pick a method and a path like POST /orders. A workflow is created for it; add data, code and a response step, publish, and call it."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                New endpoint
              </Button>
            }
          />
        </div>
      ) : list.rows.length === 0 ? (
        <ListEmpty list={list} />
      ) : (
        <div className="card">
          <table className="table table-hover">
            <thead>
              <tr>
                <SortHeader list={list} field="path" />
                <SortHeader list={list} field="mode" />
                <SortHeader list={list} field="auth" />
                <SortHeader list={list} field="workflow" />
                <SortHeader list={list} field="status" />
                <SortHeader list={list} field="enabled" className="num" />
                <th className="num">curl</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((e) => (
                <EndpointRow key={e.id} endpoint={e} onOpen={() => navigate(`/endpoints/${e.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewEndpointModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function EndpointRow({ endpoint: e, onOpen }: EndpointRowProps) {
  const update = useUpdateEndpoint({ silent: true });
  const toast = useToast();
  const setEnabled = (enabled: boolean) =>
    update.mutate(
      { id: e.id, input: { ...toEndpointInput(e), enabled } },
      { onSuccess: (ep) => toast.success(enabled ? 'Endpoint enabled' : 'Endpoint disabled', `${ep.method} ${ep.path}`) },
    );
  return (
    <tr className="clickable" onClick={onOpen}>
      <td>
        <div className="endpoint-route">
          <MethodBadge method={e.method} />
          <span className="mono endpoint-path">{e.path}</span>
        </div>
        <div className="cell-secondary">{e.name}</div>
      </td>
      <td>
        <Badge tone={e.mode === 'sync' ? 'info' : 'violet'}>{e.mode}</Badge>
      </td>
      <td className="small">
        {e.auth === 'none' ? <span className="muted">{AUTH_LABEL.none}</span> : AUTH_LABEL[e.auth]}
        {e.authorizerWorkflowId && <div className="cell-secondary">+ authorizer</div>}
      </td>
      <td>
        <WorkflowLink endpoint={e} />
      </td>
      <td>
        <ReadyBadge endpoint={e} />
      </td>
      <td className="num" onClick={(ev) => ev.stopPropagation()}>
        <Toggle checked={update.isPending ? !e.enabled : e.enabled} onChange={setEnabled} label={`Enable ${e.method} ${e.path}`} />
      </td>
      <td className="num" onClick={(ev) => ev.stopPropagation()}>
        <CopyButton text={curlSnippet(e)} label={`Copy curl for ${e.method} ${e.path}`} iconOnly />
      </td>
    </tr>
  );
}

/** Downloads the OpenAPI document (fetched through the API layer, which adds the tenant header). */
function OpenApiButton() {
  const toast = useToast();
  const download = useMutation({
    mutationFn: api.openApiSpec,
    onSuccess: (spec) => downloadJson(`openapi-${getAuth().activeTenantId ?? 'api'}.json`, spec),
    onError: (e: Error) => toast.error('Could not download the OpenAPI document', e.message),
  });
  return (
    <Button icon={FileDown} loading={download.isPending} onClick={() => download.mutate()} title="OpenAPI 3.0 document of every enabled endpoint">
      OpenAPI
    </Button>
  );
}
