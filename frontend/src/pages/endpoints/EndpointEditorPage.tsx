import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import type { EndpointInput, EndpointUpdateInput } from '../../api/types';
import { MethodBadge } from '../../components/MethodBadge';
import { SchemaFieldsEditor } from '../../components/SchemaFieldsEditor';
import { cleanSchema } from '../../components/SchemaFieldsEditor.helpers';
import { Button, EmptyState, ErrorState, Field, FieldGroup, PageHeader, Skeleton, Toggle } from '../../components/ui';
import { methodHasBody, normalizePath, toEndpointInput } from '../../lib/endpoints';
import { TIMEOUT_DEFAULT, TIMEOUT_MAX, TIMEOUT_MIN, RATE_LIMIT_MAX, RATE_LIMIT_MIN } from '../../lib/endpoints.constants';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { ConnectCard } from './ConnectCard';
import { EndpointFields } from './EndpointFields';
import { editorDraftProblem, rateLimitHelp } from './endpoints.helpers';
import type { EndpointViewProps } from './endpoints.types';
import { ReadinessPanel, ReadyBadge } from './EndpointStatus';
import { useAuthProviders, useDeleteEndpoint, useEndpoint, useUpdateEndpoint, useWorkflowOptions } from './hooks';
import { AuthorizerFields } from './AuthorizerFields';
import { TryItConsole } from './TryItConsole';

export function EndpointEditorPage() {
  const { id = '' } = useParams();
  const endpoint = useEndpoint(id);

  if (endpoint.isError) {
    const notFound = endpoint.error instanceof ApiError && endpoint.error.status === 404;
    return (
      <div className="page">
        {notFound ? (
          <EmptyState
            title="Endpoint not found"
            description="It may have been deleted."
            action={
              <Link to="/endpoints" className="btn btn-primary btn-md">
                All endpoints
              </Link>
            }
          />
        ) : (
          <ErrorState error={endpoint.error} onRetry={() => endpoint.refetch()} />
        )}
      </div>
    );
  }
  if (!endpoint.data) {
    return (
      <div className="page">
        <Skeleton w={220} h={24} />
        <div className="endpoint-layout" style={{ marginTop: 24 }}>
          <Skeleton h={420} r={12} />
          <Skeleton h={420} r={12} />
        </div>
      </div>
    );
  }
  return <EndpointEditor endpoint={endpoint.data} />;
}

function EndpointEditor({ endpoint: ep }: EndpointViewProps) {
  // Keyed by the editable fields only, so a refetch that just changes readiness keeps the user's edits.
  const savedJson = JSON.stringify(toEndpointInput(ep));
  const saved = useMemo<EndpointUpdateInput>(() => JSON.parse(savedJson), [savedJson]);
  const [draft, setDraft] = useState<EndpointUpdateInput>(saved);
  const workflows = useWorkflowOptions();
  const providers = useAuthProviders();
  const update = useUpdateEndpoint();
  const remove = useDeleteEndpoint();
  const navigate = useNavigate();

  // Follow the server copy after a save (or when another tab changed it).
  useEffect(() => setDraft(saved), [saved]);

  const dirty = JSON.stringify(draft) !== savedJson;
  const problem = editorDraftProblem(draft);
  useUnsavedChangesGuard(dirty, { allowNavigation: remove.isPending || remove.isSuccess });

  const patch = (p: Partial<EndpointInput>) => setDraft((d) => ({ ...d, ...p, workflowId: p.workflowId ?? d.workflowId }));

  const save = () => {
    if (problem || !dirty) return;
    update.mutate({
      id: ep.id,
      input: { ...draft, name: draft.name.trim(), path: normalizePath(draft.path), requestSchema: cleanSchema(draft.requestSchema ?? []) },
    });
  };

  const del = () => {
    if (!confirm(`Delete ${ep.method} ${ep.path}? Callers will get 404. The workflow “${ep.workflow?.name ?? ''}” is kept.`)) return;
    remove.mutate(ep, { onSuccess: () => navigate('/endpoints') });
  };

  // Cmd/Ctrl+S saves
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const timeoutSec = (draft.timeoutMs ?? TIMEOUT_DEFAULT) / 1000;

  return (
    <div className="page">
      <Link to="/endpoints" className="link-inline back-link">
        <ArrowLeft size={14} /> Endpoints
      </Link>
      <PageHeader
        title={ep.name}
        subtitle={
          <span className="endpoint-route">
            <MethodBadge method={ep.method} />
            <span className="mono endpoint-path">{ep.path}</span>
            <ReadyBadge endpoint={ep} />
          </span>
        }
        actions={
          <>
            {dirty && (
              <span className="unsaved">
                <span className="badge-dot" /> Unsaved changes
              </span>
            )}
            <Button variant="danger" icon={Trash2} onClick={del} loading={remove.isPending}>
              Delete
            </Button>
            <Button variant="primary" icon={Save} onClick={save} loading={update.isPending} disabled={!dirty || !!problem} title={problem}>
              Save
            </Button>
          </>
        }
      />

      <div className="endpoint-layout">
        <div className="endpoint-col">
          <section className="card panel-card">
            <header className="panel-card-head">
              <h2 className="section-title">Settings</h2>
            </header>
            <div className="panel-card-body form-stack">
              <EndpointFields value={draft} onChange={patch} workflows={workflows.data} providers={providers.data} />
              <AuthorizerFields value={draft} onChange={patch} workflows={workflows.data} />
              <Field label="Description">
                <textarea
                  className="input"
                  rows={2}
                  placeholder="What callers use it for (shown in the OpenAPI document)"
                  value={draft.description ?? ''}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </Field>
              <div className="form-grid">
                <Field label="Timeout (seconds)" help={draft.mode === 'async' ? 'Async endpoints answer at once.' : '1–30 s; callers get 504 after this.'}>
                  <input
                    className="input"
                    type="number"
                    min={TIMEOUT_MIN / 1000}
                    max={TIMEOUT_MAX / 1000}
                    step={0.5}
                    disabled={draft.mode === 'async'}
                    value={Number.isFinite(timeoutSec) ? timeoutSec : ''}
                    onChange={(e) => patch({ timeoutMs: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 1000) })}
                  />
                </Field>
                <Field label="Rate limit (calls / minute)" help={rateLimitHelp(draft)}>
                  <input
                    className="input"
                    type="number"
                    min={RATE_LIMIT_MIN}
                    max={RATE_LIMIT_MAX}
                    step={1}
                    placeholder="No endpoint limit"
                    value={draft.rateLimitPerMinute ?? ''}
                    onChange={(e) => patch({ rateLimitPerMinute: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </Field>
                <FieldGroup label="Enabled" inline help={draft.enabled ? 'Answers calls when its workflow is published.' : 'Callers get 503.'}>
                  <Toggle checked={draft.enabled ?? true} onChange={(v) => patch({ enabled: v })} label="Enabled" />
                </FieldGroup>
              </div>
              {problem && dirty && <p className="field-error" style={{ margin: 0 }}>{problem}</p>}
            </div>
          </section>

          <section className="card panel-card">
            <header className="panel-card-head">
              <h2 className="section-title">Request schema</h2>
              <span className="muted small">{methodHasBody(draft.method) ? 'Checks the JSON body' : 'Checks the query string'}</span>
            </header>
            <div className="panel-card-body">
              <SchemaFieldsEditor
                value={draft.requestSchema ?? []}
                onChange={(requestSchema) => patch({ requestSchema })}
                withDescription
                emptyText="No fields: any input is accepted. Calls that miss a required field or send the wrong type get 422."
              />
              <p className="muted small schema-hint">
                In the workflow: <span className="mono">{methodHasBody(draft.method) ? '{{request.body.<key>}}' : '{{request.query.<key>}}'}</span>
              </p>
            </div>
          </section>
        </div>

        <div className="endpoint-col">
          <ReadinessPanel endpoint={ep} />
          <ConnectCard endpoint={ep} />
          <TryItConsole key={ep.id} endpoint={ep} stale={dirty} />
        </div>
      </div>
    </div>
  );
}
