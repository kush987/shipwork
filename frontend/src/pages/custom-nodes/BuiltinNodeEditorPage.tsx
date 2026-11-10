import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { BuiltinNodeDetail, EventOption, NodeTypeDefinition } from '../../api/types';
import { ConfigFields } from '../../components/config-form/ConfigFields';
import { useRuntimeLists } from '../../components/config-form/useRuntimeLists';
import { Badge, Button, EmptyState, ErrorState, Field, Skeleton } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { StepLogicEditor } from '../../builder/StepLogicEditor';
import { formatDateTime } from '../../lib/format';
import { nodeIcon } from '../../lib/icons';
import { ICON_CHOICES } from '../../lib/icons.constants';
import { changeSummary, formFrom, sameForm, shownDefaults, toInput, withDefault } from './builtinNodes.helpers';
import { BUILTIN_LIST_PATH } from './customNodes.constants';
import { useEventOptions } from './hooks';
import { Section } from './Section';
import type { BuiltinNodeForm } from './customNodes.types';

/** A built-in step as this workspace has it: name, icon, defaults and workspace logic. Reset, never deleted. */
export function BuiltinNodeEditorPage() {
  const { type = '' } = useParams();
  const detail = useQuery({ queryKey: queryKeys.builtinNode(type), queryFn: () => api.getBuiltinNode(type) });
  const events = useEventOptions();
  if (detail.isLoading) {
    return (
      <div className="page">
        <Skeleton h={28} w="40%" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="page">
        {detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : <EmptyState title="Built-in step not found" />}
      </div>
    );
  }
  // A new version (save or reset) starts the form over from what was stored.
  return <BuiltinNodeEditor key={`${detail.data.type}@${detail.data.edit?.version ?? 0}`} detail={detail.data} events={events.data ?? []} />;
}

function BuiltinNodeEditor({ detail, events }: { detail: BuiltinNodeDetail; events: EventOption[] }) {
  const initial = useMemo(() => formFrom(detail), [detail]);
  const [form, setForm] = useState<BuiltinNodeForm>(initial);
  const [pickingIcon, setPickingIcon] = useState(false);
  const dirty = !sameForm(form, initial);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const lists = useRuntimeLists(detail.settings);
  const patch = (next: Partial<BuiltinNodeForm>) => setForm((f) => ({ ...f, ...next }));

  const stored = (d: BuiltinNodeDetail) => {
    qc.setQueryData(queryKeys.builtinNode(d.type), d);
    qc.invalidateQueries({ queryKey: queryKeys.builtinNodes });
    qc.invalidateQueries({ queryKey: queryKeys.catalog }); // palette, cards and inspector show the change
  };
  const save = useMutation({
    mutationFn: () => api.saveBuiltinNode(detail.type, toInput(form)),
    onSuccess: (d) => {
      stored(d);
      toast.success('Saved', d.edit ? `${d.label} · version ${d.edit.version}` : d.label);
    },
    onError: (e: Error) => toast.error('Could not save', e.message),
  });
  const reset = useMutation({
    mutationFn: () => api.resetBuiltinNode(detail.type),
    onSuccess: (d) => {
      stored(d);
      toast.success('Reset to default', `${d.label} is back to the app’s own`);
    },
    onError: (e: Error) => toast.error('Could not reset', e.message),
  });

  const label = form.label.trim() || detail.base.label;
  const icon = form.icon || detail.base.icon;
  const Icon = nodeIcon(icon, detail.category);
  // What the step-logic editor needs to write starter code that fits this step.
  const def: NodeTypeDefinition = { type: detail.type, category: detail.category, label, description: detail.description, icon, configSchema: detail.settings, outputs: detail.outputs };
  const changedDefaults = detail.settings.filter((f) => f.key in form.defaults);

  return (
    <div className="cn-page">
      <header className="cn-topbar">
        <button className="icon-btn" aria-label="Back to built-in steps" onClick={() => navigate(BUILTIN_LIST_PATH)}>
          <ArrowLeft size={16} />
        </button>
        <span className={`tl-icon cat-${detail.category}`}>
          <Icon size={14} />
        </span>
        <div className="cn-title">
          <h1>{label}</h1>
          <div className="cn-sub">
            <span className="mono">{detail.type}</span> · Built-in step · {detail.edit ? `v${detail.edit.version}` : 'app default'}
            {detail.edited && <Badge tone="accent">Edited</Badge>}
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </div>
        </div>
        <div className="cn-actions">
          <Button
            icon={RotateCcw}
            variant="ghost"
            loading={reset.isPending}
            disabled={!detail.edited}
            title="Back to the app’s name, icon and defaults, with no workspace logic. The history is kept."
            onClick={() => {
              if (confirm(`Reset “${label}” to the app’s own? Workflows published with its workspace logic keep running that version until republished.`)) reset.mutate();
            }}
          >
            Reset to default
          </Button>
          <Button variant="primary" icon={Save} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
            {dirty ? `Save as v${(detail.edit?.version ?? 0) + 1}` : 'Saved'}
          </Button>
        </div>
      </header>

      <div className="cn-body">
        <div className="cn-col">
          <Section step={1} title="How it appears" description="Its name, description and icon in this workspace’s palette, step cards and run history. Blank means the app’s own.">
            <Field label="Name" help={`The app calls it “${detail.base.label}”.`}>
              <input className="input" value={form.label} placeholder={detail.base.label} maxLength={60} onChange={(e) => patch({ label: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea className="input" rows={3} value={form.description} placeholder={detail.base.description} maxLength={300} onChange={(e) => patch({ description: e.target.value })} />
            </Field>
            <div className="field">
              <span className="field-label">Icon</span>
              <div className="cn-icon-row">
                <span className={`tl-icon cat-${detail.category}`}>
                  <Icon size={14} />
                </span>
                <span className="mono small muted">{icon}</span>
                <button type="button" className="link-inline small" onClick={() => setPickingIcon((p) => !p)}>
                  {pickingIcon ? 'Done' : 'Change icon'}
                </button>
                {form.icon && (
                  <button type="button" className="link-inline small" onClick={() => patch({ icon: '' })}>
                    Use the app’s icon
                  </button>
                )}
              </div>
              {pickingIcon && (
                <div className="icon-picker" role="radiogroup" aria-label="Icon">
                  {ICON_CHOICES.map((name) => {
                    const Choice = nodeIcon(name, detail.category);
                    return (
                      <button
                        type="button"
                        key={name}
                        role="radio"
                        aria-checked={icon === name}
                        aria-label={name}
                        title={name}
                        className={`icon-choice${icon === name ? ' selected' : ''}`}
                        onClick={() => patch({ icon: name === detail.base.icon ? '' : name })}
                      >
                        <Choice size={15} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>

          <Section
            step={2}
            title="Default settings"
            description="What a newly added step starts with. Steps already in your workflows keep their own settings."
            actions={
              changedDefaults.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => patch({ defaults: {} })}>
                  Use the app’s defaults
                </Button>
              ) : undefined
            }
          >
            {changedDefaults.length > 0 && <p className="small muted">Changed here: {changedDefaults.map((f) => f.label).join(', ')}</p>}
            {detail.settings.length ? (
              <ConfigFields
                // A default is never required: a new step can still be left blank and filled in later.
                fields={detail.settings.map((f) => ({ ...f, required: false }))}
                values={shownDefaults(detail.settings, form.defaults)}
                onChange={(key, value) => {
                  const field = detail.settings.find((f) => f.key === key);
                  if (field) setForm((f) => ({ ...f, defaults: withDefault(f.defaults, field, value) }));
                }}
                events={events}
                lists={lists}
                keyPrefix="defaults"
              />
            ) : (
              <p className="small muted">This step has no settings.</p>
            )}
          </Section>

          <Section step={4} title="History" description="Every save is a new version; nothing is ever deleted.">
            {detail.history.length ? (
              <ul className="version-list">
                {detail.history.map((h) => (
                  <li key={h.version}>
                    <span className="mono">v{h.version}</span> · {formatDateTime(h.createdAt)}
                    {h.createdBy && <span className="muted"> · {h.createdBy}</span>}
                    <div className="small muted">{h.changes.length ? h.changes.join(', ') : 'no changes (back to the app’s own)'}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">Not changed in this workspace yet — it is exactly as the app ships it.</p>
            )}
          </Section>
        </div>

        <div className="cn-col">
          <Section step={3} title="Workspace logic" description={`JavaScript that runs on every “${label}” step in this workspace.`}>
            {detail.logicAllowed ? (
              <StepLogicEditor
                def={def}
                logic={form.logic}
                readOnly={false}
                onChange={(logic) => patch({ logic })}
                title="Workspace logic"
                help="Its before() runs first and its after() last, around each step’s own logic. Draft test runs use what you save here; publishing a workflow pins the version it runs, so published workflows change only when republished."
              />
            ) : (
              <p className="small muted">{detail.logicNote}</p>
            )}
          </Section>
          {changeSummary(detail.edit).length > 0 && (
            <p className="small muted cn-note">In use now (v{detail.edit!.version}): {changeSummary(detail.edit).join(', ')}.</p>
          )}
        </div>
      </div>
    </div>
  );
}
