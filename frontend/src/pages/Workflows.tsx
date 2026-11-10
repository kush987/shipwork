import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Pause, Play, Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Workflow } from '../api/types';
import { ListEmpty } from '../components/list/ListEmpty';
import { ListToolbar } from '../components/list/ListToolbar';
import { SortHeader } from '../components/list/SortHeader';
import { useList } from '../components/list/useList';
import { TriggerChip } from '../components/TriggerChip';
import { Badge, Button, EmptyState, ErrorState, Field, Modal, PageHeader, StatusPill, TableSkeleton } from '../components/ui';
import { useToast } from '../components/useToast';
import { DuplicateWorkflowModal } from '../components/workflows/DuplicateWorkflowModal';
import { usePauseWorkflow } from '../components/workflows/usePauseWorkflow';
import { timeAgo } from '../lib/format';
import { WORKFLOW_LIST } from './Workflows.list';
import { listStatusOf } from './Workflows.helpers';
import type { CreateWorkflowModalProps, VersionSummaryProps } from './Workflows.types';

export function WorkflowsPage() {
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: api.listWorkflows });
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState<Workflow | null>(null);
  const list = useList(workflows.data, WORKFLOW_LIST);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const pause = usePauseWorkflow();

  const archive = useMutation({
    mutationFn: (id: string) => api.archiveWorkflow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow archived');
    },
    onError: (e: Error) => toast.error('Could not archive workflow', e.message),
  });

  return (
    <div className="page">
      <PageHeader
        title="Workflows"
        subtitle="Visual automations started by shipment events, API calls or a schedule."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New workflow
          </Button>
        }
      />

      {list.total > 0 && <ListToolbar list={list} />}

      {workflows.isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : workflows.isError ? (
        <ErrorState error={workflows.error} onRetry={() => workflows.refetch()} />
      ) : list.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={WorkflowIcon}
            title="Build your first workflow"
            description="Start from a template like “Cheapest courier for COD orders” or from a blank canvas."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                New workflow
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
                <SortHeader list={list} field="name" />
                <SortHeader list={list} field="status" />
                <SortHeader list={list} field="trigger" />
                <SortHeader list={list} field="versions" label="Versions" />
                <SortHeader list={list} field="updated" className="num" />
                <th />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((w) => (
                <tr key={w.id} className="clickable" onClick={() => navigate(`/workflows/${w.id}`)}>
                  <td>
                    <div className="cell-primary">{w.name}</div>
                    {w.description && <div className="cell-secondary truncate">{w.description}</div>}
                  </td>
                  <td>
                    <StatusPill status={listStatusOf(w)} />
                  </td>
                  <td>
                    <TriggerChip event={w.triggerEvent} />
                  </td>
                  <td>
                    <VersionSummary w={w} />
                  </td>
                  <td className="num small muted">{timeAgo(w.updatedAt)}</td>
                  <td className="num">
                    {w.publishedVersion !== null && (
                      <button
                        className="icon-btn row-action"
                        title={w.paused ? 'Resume — let its triggers start it again' : 'Pause — stop its triggers from starting it'}
                        aria-label={w.paused ? 'Resume workflow' : 'Pause workflow'}
                        disabled={pause.pending}
                        onClick={(e) => {
                          e.stopPropagation();
                          pause.toggle(w);
                        }}
                      >
                        {w.paused ? <Play size={15} /> : <Pause size={15} />}
                      </button>
                    )}
                    <button
                      className="icon-btn row-action"
                      title="Copy with a new name"
                      aria-label="Copy workflow"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCopying(w);
                      }}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon-btn row-action"
                      title="Archive"
                      aria-label="Archive workflow"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Archive "${w.name}"? Running executions will finish.`)) archive.mutate(w.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateWorkflowModal open={creating} onClose={() => setCreating(false)} />
      <DuplicateWorkflowModal source={copying} onClose={() => setCopying(null)} />
    </div>
  );
}

function VersionSummary({ w }: VersionSummaryProps) {
  return (
    <div className="version-summary">
      {w.publishedVersion ? <Badge tone="success">v{w.publishedVersion} live</Badge> : null}
      {w.latestVersion !== w.publishedVersion && <Badge>v{w.latestVersion} draft</Badge>}
    </div>
  );
}

function CreateWorkflowModal({ open, onClose }: CreateWorkflowModalProps) {
  const templates = useQuery({ queryKey: ['templates'], queryFn: api.templates, enabled: open });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const create = useMutation({
    mutationFn: () => api.createWorkflow({ name: name.trim(), description: description.trim() || undefined, templateId: templateId || undefined }),
    onSuccess: ({ workflow, parts }) => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      toast.success(
        'Workflow created',
        parts?.length
          ? `${workflow.name} · v1 draft. Also created ${parts.map((p) => `“${p.name}”`).join(' and ')} for it to run — publish those first.`
          : `${workflow.name} · v1 draft`,
      );
      onClose();
      setName('');
      setDescription('');
      setTemplateId('');
      navigate(`/workflows/${workflow.id}`);
    },
    onError: (e: Error) => toast.error('Could not create workflow', e.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New workflow"
      description="Workflows are versioned. You'll start on a v1 draft."
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            Create workflow
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Field label="Name" required>
          <input
            className="input"
            autoFocus
            placeholder="e.g. COD orders → cheapest courier"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description">
          <textarea
            className="input"
            rows={2}
            placeholder="What does this automation do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="field">
          <span className="field-label">Start from</span>
          <div className="template-grid">
            <button
              type="button"
              className={`template-card ${templateId === '' ? 'selected' : ''}`}
              onClick={() => setTemplateId('')}
            >
              <div className="template-name">Blank canvas</div>
              <div className="template-desc">Just a trigger node. Build from scratch.</div>
            </button>
            {templates.isLoading &&
              [0, 1].map((i) => <div key={i} className="template-card skeleton-card" />)}
            {templates.data?.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`template-card ${templateId === t.id ? 'selected' : ''}`}
                onClick={() => {
                  setTemplateId(t.id);
                  if (!name.trim()) setName(t.name);
                }}
              >
                <div className="template-name">{t.name}</div>
                <div className="template-desc">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
