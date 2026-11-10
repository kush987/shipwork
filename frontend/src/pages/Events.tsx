import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Plus, Radio, Trash2, Workflow as WorkflowIcon, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { EventDefinition, EventDefinitionInput, EventPayloadField } from '../api/types';
import { ListEmpty } from '../components/list/ListEmpty';
import { ListToolbar } from '../components/list/ListToolbar';
import { SortHeader } from '../components/list/SortHeader';
import { useList } from '../components/list/useList';
import { Badge, Button, EmptyState, ErrorState, Field, Modal, PageHeader, Skeleton } from '../components/ui';
import { useToast } from '../components/useToast';
import { errorMessages } from '../lib/errors';
import { slugify } from '../lib/format';
import { BLANK_EVENT, CUSTOM_EVENT_PREFIX_RE } from './Events.constants';
import { curlFor, listenersByEvent, sanitizeSlug, toEventInput, toEventUpdate } from './Events.helpers';
import { builtInEventList, customEventList } from './Events.list';
import type { EventModalProps, EventModalTarget, WorkflowLinksProps } from './Events.types';

export function EventsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const defs = useQuery({ queryKey: ['event-definitions', 'all'], queryFn: () => api.listEventDefinitions(true) });
  const catalog = useQuery({ queryKey: ['events'], queryFn: api.eventCatalog });
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: api.listWorkflows });
  const [editing, setEditing] = useState<EventModalTarget>(null);
  const [howTo, setHowTo] = useState<EventDefinition | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  /** New workflow whose trigger is already set to this event, opened in the builder. */
  const startWorkflow = useMutation({
    mutationFn: async (d: EventDefinition) => {
      const { workflow } = await api.createWorkflow({ name: `${d.label} handling`, description: `Runs when “${d.label}” is sent.` });
      await api.saveDraft(workflow.id, {
        nodes: [{ id: 'trigger', type: 'trigger.event', name: d.label, position: { x: 0, y: 150 }, config: { event: d.key } }],
        edges: [],
      });
      return workflow;
    },
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      navigate(`/workflows/${w.id}`);
    },
    onError: (e: Error) => toast.error('Could not create workflow', e.message),
  });

  // event key → published workflows that start on it
  const listeners = useMemo(() => listenersByEvent(workflows.data), [workflows.data]);

  const archive = useMutation({
    mutationFn: (d: EventDefinition) => (d.archived ? api.restoreEventDefinition(d.id) : api.archiveEventDefinition(d.id)),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['event-definitions'] });
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success(
        d.archived ? `${d.label} archived` : `${d.label} restored`,
        d.archived ? 'It can no longer be sent; workflows that start on it won’t run.' : undefined,
      );
    },
    onError: (e: Error) => toast.error('Could not update event', e.message),
  });

  const shownDefs = useMemo(() => defs.data?.filter((d) => showArchived || !d.archived), [defs.data, showArchived]);
  const archivedCount = (defs.data ?? []).filter((d) => d.archived).length;
  const builtInEvents = useMemo(() => catalog.data?.filter((e) => !e.custom), [catalog.data]);
  const customConfig = useMemo(() => customEventList(listeners), [listeners]);
  const builtInConfig = useMemo(() => builtInEventList(listeners), [listeners]);
  const custom = useList(shownDefs, customConfig);
  const builtIn = useList(builtInEvents, builtInConfig);

  return (
    <div className="page">
      <PageHeader
        title="Events"
        subtitle="Events start workflows. ShipFlow raises the built-in shipment events itself; define your own for anything else — then send them from your systems, a shipment, or another workflow."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            New event
          </Button>
        }
      />

      <div className="section-header">
        <h2 className="section-title">Custom events</h2>
      </div>
      {(custom.total > 0 || archivedCount > 0) && (
        <ListToolbar list={custom} sortMenu>
          {archivedCount > 0 && (
            <label className="check">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived ({archivedCount})
            </label>
          )}
        </ListToolbar>
      )}
      {defs.isLoading ? (
        <Skeleton h={120} />
      ) : defs.isError ? (
        <ErrorState error={defs.error} onRetry={() => defs.refetch()} />
      ) : custom.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={Radio}
            title="No custom events yet"
            description="For example “Payment failed”, “Customer flagged VIP” or “Address verified”. Once defined, pick it as a workflow trigger."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                New event
              </Button>
            }
          />
        </div>
      ) : custom.rows.length === 0 ? (
        <ListEmpty list={custom} />
      ) : (
        <div className="event-grid">
          {custom.rows.map((d) => {
            const flows = listeners[d.key] ?? [];
            return (
              <article key={d.id} className={`card event-card${d.archived ? ' is-inactive' : ''}`}>
                <header className="event-card-head">
                  <span className="event-card-icon">
                    <Radio size={15} />
                  </span>
                  <div className="event-card-title">
                    <h3>
                      {d.label} {d.archived && <Badge tone="neutral">Archived</Badge>}
                    </h3>
                    <span className="mono small muted">{d.key}</span>
                  </div>
                </header>
                {d.description && <p className="event-card-desc">{d.description}</p>}
                <div className="event-card-row">
                  <span className="event-card-label">Payload</span>
                  {d.payloadSchema.length ? (
                    <div className="chip-row">
                      {d.payloadSchema.map((f) => (
                        <span key={f.key} className="handle-chip mono" title={f.label}>
                          {f.key}: {f.kind}
                          {f.required ? '*' : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted small">none</span>
                  )}
                </div>
                <div className="event-card-row">
                  <span className="event-card-label">Starts</span>
                  <WorkflowLinks flows={flows} />
                </div>
                <footer className="warehouse-card-actions">
                  {!d.archived && (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Zap}
                      loading={startWorkflow.isPending && startWorkflow.variables?.id === d.id}
                      onClick={() => startWorkflow.mutate(d)}
                    >
                      New workflow
                    </Button>
                  )}
                  <Button size="sm" icon={Pencil} onClick={() => setEditing(d)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setHowTo(d)}>
                    How to send
                  </Button>
                  <Button size="sm" variant="ghost" icon={d.archived ? ArchiveRestore : Archive} onClick={() => archive.mutate(d)}>
                    {d.archived ? 'Restore' : 'Archive'}
                  </Button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <div className="section-header">
        <h2 className="section-title">Built-in shipment events</h2>
        <span className="muted small">Raised by ShipFlow and courier webhooks</span>
      </div>
      {builtIn.total > 0 && <ListToolbar list={builtIn} />}
      {builtIn.total > 0 && builtIn.rows.length === 0 ? (
        <ListEmpty list={builtIn} />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <SortHeader list={builtIn} field="name" />
                <SortHeader list={builtIn} field="key" />
                <SortHeader list={builtIn} field="workflows" />
              </tr>
            </thead>
            <tbody>
              {builtIn.rows.map((e) => (
                <tr key={e.value}>
                  <td className="cell-primary">{e.label}</td>
                  <td className="mono small">{e.value}</td>
                  <td>
                    <WorkflowLinks flows={listeners[e.value] ?? []} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EventModal target={editing} onClose={() => setEditing(null)} />
      {howTo && (
        <Modal
          open
          onClose={() => setHowTo(null)}
          width={640}
          title={`Sending “${howTo.label}”`}
          description="Every event concerns one shipment, identified by shipmentId or orderId."
          footer={
            <Button variant="primary" onClick={() => setHowTo(null)}>
              Done
            </Button>
          }
        >
          <div className="form-stack">
            <div>
              <div className="field-label">From your systems (API)</div>
              <pre className="json-pre code-block">{curlFor(howTo)}</pre>
            </div>
            <div>
              <div className="field-label">From the app</div>
              <p className="muted small">Open a shipment and use “Send event”.</p>
            </div>
            <div>
              <div className="field-label">From another workflow</div>
              <p className="muted small">Add an “Emit event” node (Flow control) and choose {howTo.label}.</p>
            </div>
            <div>
              <div className="field-label">Inside the workflows it starts</div>
              <p className="muted small">
                Payload values are available as{' '}
                {howTo.payloadSchema.length
                  ? howTo.payloadSchema.map((f, i) => (
                      <span key={f.key}>
                        {i > 0 && ', '}
                        <span className="mono">{`{{trigger.data.payload.${f.key}}}`}</span>
                      </span>
                    ))
                  : <span className="mono">{'{{trigger.data.payload.<key>}}'}</span>}{' '}
                in messages, and as <span className="mono">trigger.data.payload.&lt;key&gt;</span> in conditions.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function WorkflowLinks({ flows }: WorkflowLinksProps) {
  if (!flows.length) return <span className="muted small">No published workflow</span>;
  return (
    <span className="workflow-links">
      {flows.map((w) => (
        <Link key={w.id} to={`/workflows/${w.id}`} className="workflow-link">
          <WorkflowIcon size={12} /> {w.name}
        </Link>
      ))}
    </span>
  );
}

function EventModal({ target, onClose }: EventModalProps) {
  const [draft, setDraft] = useState<EventDefinitionInput>(BLANK_EVENT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = target === 'new';

  useEffect(() => {
    setErrors([]);
    setSlugTouched(false);
    if (target === 'new') setDraft(BLANK_EVENT);
    else if (target) setDraft(toEventInput(target));
  }, [target]);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.createEventDefinition({ ...draft, slug: draft.slug || slugify(draft.label) })
        : api.updateEventDefinition((target as EventDefinition).id, toEventUpdate(draft)),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['event-definitions'] });
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success(isNew ? 'Event created' : 'Event updated', isNew ? `Pick “${d.label}” as the trigger of a workflow.` : undefined);
      onClose();
    },
    onError: (e: Error) => setErrors(errorMessages(e)),
  });

  if (!target) return null;
  const set = <K extends keyof EventDefinitionInput>(k: K, v: EventDefinitionInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const fields = draft.payloadSchema;
  const setField = (i: number, patch: Partial<EventPayloadField>) =>
    set(
      'payloadSchema',
      fields.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    );
  const slug = draft.slug ?? slugify(draft.label);

  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title={isNew ? 'New event' : `Edit ${(target as EventDefinition).label}`}
      description={isNew ? 'Define something that can happen to a shipment; workflows can start on it.' : 'The key can’t change — workflows reference it.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={draft.label.trim().length < 2} onClick={() => save.mutate()}>
            {isNew ? 'Create event' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="form-sections">
        {errors.length > 0 && (
          <div className="cn-errors" role="alert" style={{ margin: 0 }}>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <section className="form-section">
          <div className="form-grid">
            <Field label="Name" required>
              <input
                className="input"
                placeholder="Payment failed"
                value={draft.label}
                onChange={(e) => {
                  set('label', e.target.value);
                  if (isNew && !slugTouched) set('slug', slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="Key" help={isNew ? 'Workflows trigger on this; it can’t change later' : undefined}>
              <div className="key-input">
                <span className="mono">custom.</span>
                <input
                  className="input mono"
                  aria-label="Event key"
                  disabled={!isNew}
                  value={isNew ? slug : (target as EventDefinition).key.replace(CUSTOM_EVENT_PREFIX_RE, '')}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug', sanitizeSlug(e.target.value));
                  }}
                />
              </div>
            </Field>
            <div className="form-grid-full">
              <Field label="Description">
                <textarea className="input" rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-head">
            <h4 className="form-section-title">Payload fields</h4>
            <span className="muted small">Extra data sent with the event</span>
          </div>
          {fields.length === 0 && <p className="muted small" style={{ margin: 0 }}>No fields — the event carries just the shipment.</p>}
          {fields.map((f, i) => (
            <div key={i} className="event-field-row">
              <input className="input mono" aria-label={`Field ${i + 1} key`} placeholder="key" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} />
              <input className="input" aria-label={`Field ${i + 1} label`} placeholder="Label" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
              <select
                className="input"
                aria-label={`Field ${i + 1} type`}
                value={f.kind}
                onChange={(e) => setField(i, { kind: e.target.value as EventPayloadField['kind'] })}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Yes / no</option>
              </select>
              <label className="check">
                <input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                Required
              </label>
              <button type="button" className="icon-btn" aria-label={`Remove field ${f.key || i + 1}`} onClick={() => set('payloadSchema', fields.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="link-inline"
            onClick={() => set('payloadSchema', [...fields, { key: `field${fields.length + 1}`, label: '', kind: 'text' }])}
          >
            <Plus size={13} /> Add field
          </button>
        </section>
      </div>
    </Modal>
  );
}
