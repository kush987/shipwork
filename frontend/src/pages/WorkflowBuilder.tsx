import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { orderBy } from 'lodash-es';
import { AlertTriangle, ArrowLeft, CircleCheck, Copy, Eye, Pause, Play, PlayCircle, Plus, Rocket, Save, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import type { TestRunInput, TestRunResult, TriggerKind, ValidationError, WorkflowVersion } from '../api/types';
import { CATALOG_STALE_MS, DND_MIME, EDGE_DEFAULTS, FAILED_HANDLE } from '../builder/builder.constants';
import { catalogByType, defaultConfig, failurePaths, newEdgeId, newNodeId, outputsOf, readsDataSources, stepsBefore, workflowDataPaths } from '../builder/builder.helpers';
import type { FlowEdge, FlowNode, NodePatch } from '../builder/builder.types';
import { fromFlow, toFlow } from '../builder/convert';
import { Inspector } from '../builder/Inspector';
import { NODE_TYPES } from '../builder/node-types.constants';
import { Palette } from '../builder/Palette';
import { TestRunModal } from '../builder/TestRunModal';
import { fitReadable } from '../builder/viewport';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { useToast } from '../components/useToast';
import { DuplicateWorkflowModal } from '../components/workflows/DuplicateWorkflowModal';
import { usePauseWorkflow } from '../components/workflows/usePauseWorkflow';
import { httpStatusLabel, pluralize, timeAgo } from '../lib/format';
import { useUnsavedChangesGuard } from '../lib/useUnsavedChangesGuard';
import type { VersionBadgeProps } from './WorkflowBuilder.types';

export function WorkflowBuilderPage() {
  return (
    <ReactFlowProvider>
      <Builder />
    </ReactFlowProvider>
  );
}

function Builder() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const rf = useReactFlow<FlowNode, FlowEdge>();

  const detail = useQuery({ queryKey: ['workflow', id], queryFn: () => api.getWorkflow(id) });
  // Short stale time so custom nodes created in another tab show up when you come back.
  const catalogQ = useQuery({ queryKey: ['catalog'], queryFn: api.nodeCatalog, staleTime: CATALOG_STALE_MS });
  const eventsQ = useQuery({ queryKey: ['events'], queryFn: api.eventCatalog, staleTime: CATALOG_STALE_MS });

  const catalog = useMemo(() => catalogByType(catalogQ.data), [catalogQ.data]);

  // The editable working copy is the draft if one exists, else the published version (saving forks a new draft).
  const working: WorkflowVersion | null = detail.data ? (detail.data.draft ?? detail.data.published) : null;
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const viewingOther = viewVersion !== null && viewVersion !== working?.version;
  const otherQ = useQuery({
    queryKey: ['workflow', id, 'version', viewVersion],
    queryFn: () => api.getVersion(id, viewVersion!),
    enabled: viewingOther,
  });
  const shown: WorkflowVersion | null = viewingOther ? (otherQ.data ?? null) : working;
  const readOnly = viewingOther;

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<FlowEdge>([]);
  // Fields of the sources Get / Find records steps read, for `context.<name>.<field>` suggestions.
  const sourcesQ = useQuery({ queryKey: queryKeys.dataSources, queryFn: api.listDataSources, enabled: readsDataSources(nodes), staleTime: CATALOG_STALE_MS });
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<ValidationError[] | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  const loadedKey = useRef<string | null>(null);

  // Load a version into the canvas when the shown version (or catalog) changes.
  useEffect(() => {
    if (!shown || !catalogQ.data) return;
    const key = `${shown.id}:${shown.version}:${readOnly}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    const { nodes: n, edges: e } = toFlow(shown.definition, catalog, { readOnly });
    setNodes(n);
    setEdges(e);
    setDirty(false);
    setErrors(null);
    requestAnimationFrame(() => fitReadable(rf));
  }, [shown, catalog, catalogQ.data, readOnly, setNodes, setEdges, rf]);

  // Overlay validation errors onto nodes.
  useEffect(() => {
    const byNode = new Map<string, string[]>();
    for (const e of errors ?? []) if (e.nodeId) byNode.set(e.nodeId, [...(byNode.get(e.nodeId) ?? []), e.message]);
    setNodes((ns) =>
      ns.map((n) => {
        const next = byNode.get(n.id);
        if (!next && !n.data.errors) return n;
        return { ...n, data: { ...n.data, errors: next } };
      }),
    );
  }, [errors, setNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      if (readOnly) {
        onNodesChangeBase(changes.filter((c) => c.type === 'select' || c.type === 'dimensions'));
        return;
      }
      if (changes.some((c) => c.type === 'remove' || c.type === 'add' || (c.type === 'position' && c.dragging))) setDirty(true);
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase, readOnly],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      if (readOnly) {
        onEdgesChangeBase(changes.filter((c) => c.type === 'select'));
        return;
      }
      if (changes.some((c) => c.type === 'remove' || c.type === 'add')) setDirty(true);
      onEdgesChangeBase(changes);
    },
    [onEdgesChangeBase, readOnly],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || c.source === c.target) return;
      setEdges((es) => {
        // one edge per output handle keeps branching unambiguous
        const filtered = es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? 'default') === (c.sourceHandle ?? 'default')));
        return addEdge({ ...c, id: newEdgeId(), sourceHandle: c.sourceHandle ?? 'default', ...EDGE_DEFAULTS }, filtered);
      });
      setDirty(true);
    },
    [readOnly, setEdges],
  );

  const triggerNode = nodes.find((n) => n.data.def?.isTrigger || n.data.def?.category === 'trigger');
  const hasTrigger = !!triggerNode;
  // What a test run needs: a shipment (event, also the default), a request (http) or nothing (schedule).
  const triggerKind: TriggerKind = triggerNode?.data.def?.triggerKind ?? 'event';
  const selected = nodes.find((n) => n.selected) ?? null;

  const addNode = useCallback(
    (type: string, position?: { x: number; y: number }) => {
      const def = catalog.get(type);
      if (!def || readOnly) return;
      const sel = nodes.find((n) => n.selected);
      let pos = position;
      if (!pos) {
        if (sel) pos = { x: sel.position.x + 300, y: sel.position.y };
        else {
          const el = document.querySelector('.builder-canvas')?.getBoundingClientRect();
          pos = rf.screenToFlowPosition({
            x: (el?.left ?? 0) + (el?.width ?? 800) / 2 - 120,
            y: (el?.top ?? 0) + (el?.height ?? 600) / 2 - 40,
          });
        }
      }
      const nid = newNodeId(type);
      const node: FlowNode = {
        id: nid,
        type: 'shipflow',
        position: pos,
        selected: true,
        data: { nodeType: type, name: def.label, config: defaultConfig(def), def },
      };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
      // Click-to-add after a selected node auto-connects its first free output.
      if (!position && sel && sel.data.def) {
        const outs = outputsOf(sel.data.def);
        const free = outs.find((o) => !edges.some((e) => e.source === sel.id && (e.sourceHandle ?? 'default') === o.id));
        if (free && !def.isTrigger) {
          setEdges((es) => [...es, { id: newEdgeId(), source: sel.id, sourceHandle: free.id, target: nid, ...EDGE_DEFAULTS }]);
        }
      }
      setDirty(true);
    },
    [catalog, readOnly, nodes, edges, rf, setNodes, setEdges],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DND_MIME);
      if (!type) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX - 120, y: e.clientY - 30 });
      addNode(type, pos);
    },
    [rf, addNode],
  );

  /** What the selected step can read: data saved by the steps before it, and the error when a Failed path leads to it. */
  const hintPathsFor = (id: string) => {
    const before = stepsBefore(nodes, edges, id);
    // A step reached only through its Failed path saved nothing.
    const reached = new Set([id, ...before.map((n) => n.id)]);
    const savedNothing = new Set(
      before
        .filter((n) => {
          const into = edges.filter((e) => e.source === n.id && reached.has(e.target));
          return into.length > 0 && into.every((e) => e.sourceHandle === FAILED_HANDLE);
        })
        .map((n) => n.id),
    );
    return [...failurePaths(edges, before, id), ...workflowDataPaths(before.filter((n) => !savedNothing.has(n.id)), sourcesQ.data)];
  };

  const updateNode = useCallback(
    (nid: string, patch: NodePatch) => {
      setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, ...patch } } : n)));
      setDirty(true);
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (nid: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== nid));
      setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid));
      setDirty(true);
    },
    [setNodes, setEdges],
  );

  const definition = () => fromFlow(nodes, edges);

  const handleApiError = (title: string, e: unknown) => {
    if (e instanceof ApiError && e.errors?.length) {
      setErrors(e.errors);
      toast.error(title, pluralize(e.errors.length, 'validation issue'));
    } else toast.error(title, e instanceof Error ? e.message : undefined);
  };

  const saveM = useMutation({
    mutationFn: () => api.saveDraft(id, definition()),
    onSuccess: (v) => {
      setDirty(false);
      // keep the canvas as-is; the refetched draft has the same content
      loadedKey.current = `${v.id}:${v.version}:false`;
      setViewVersion(null);
      qc.invalidateQueries({ queryKey: ['workflow', id] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  const save = async (silent = false) => {
    try {
      const v = await saveM.mutateAsync();
      if (!silent) toast.success('Draft saved', `v${v.version} draft`);
      return v;
    } catch (e) {
      handleApiError('Could not save draft', e);
      throw e;
    }
  };

  const validateM = useMutation({
    mutationFn: () => api.validate(id, definition()),
    onSuccess: (r) => {
      setErrors(r.errors);
      if (r.valid) toast.success('Workflow is valid', 'Ready to publish.');
      else toast.error('Validation failed', `${r.errors.length} issue${r.errors.length > 1 ? 's' : ''} to fix`);
    },
    onError: (e) => handleApiError('Could not validate', e),
  });

  const publishM = useMutation({
    mutationFn: async () => {
      if (dirty || !detail.data?.draft) await save(true);
      return api.publish(id);
    },
    onSuccess: (v) => {
      setErrors(null);
      toast.success(`Published v${v.version}`, 'New executions will use this version.');
      qc.invalidateQueries({ queryKey: ['workflow', id] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e) => handleApiError('Publish failed', e),
  });

  const pause = usePauseWorkflow();
  // Phones: the palette opens over the canvas from "Add step"; the inspector is a sheet while a step is selected.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const deselect = useCallback(() => setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n))), [setNodes]);

  const testM = useMutation({
    mutationFn: async (input: TestRunInput) => {
      if (dirty) await save(true);
      return api.testRun(id, input);
    },
    onSuccess: (result) => {
      // API workflows answer synchronously: keep the modal open to show the response (it links the execution).
      if (result.response) {
        setTestResult(result);
        toast.success('Test request finished', `Responded ${httpStatusLabel(result.response.statusCode)}`);
        return;
      }
      setTestOpen(false);
      toast.info('Test run started');
      navigate(`/executions/${result.executionId}`);
    },
    onError: (e) => handleApiError('Test run failed', e),
  });

  // Unsaved changes guard: in-app navigation and tab close (a test run saves first, then navigates).
  useUnsavedChangesGuard(dirty, { allowNavigation: testM.isPending });

  // Cmd/Ctrl+S saves
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!readOnly && dirty) save().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const focusNode = (nid: string) => {
    const n = rf.getNode(nid);
    if (!n) return;
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === nid })));
    rf.setCenter(n.position.x + 120, n.position.y + 40, { zoom: 1.1, duration: 300 });
  };

  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div className="page">
        {notFound ? (
          <EmptyState
            title="Workflow not found"
            description="It may have been archived."
            action={
              <Link to="/workflows" className="btn btn-primary btn-md">
                Back to workflows
              </Link>
            }
          />
        ) : (
          <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
        )}
      </div>
    );
  }

  const wf = detail.data?.workflow;
  const versions = detail.data?.versions ?? [];
  const busy = saveM.isPending || publishM.isPending || validateM.isPending;
  const canPublish = !readOnly && (dirty || !!detail.data?.draft);

  return (
    <div className="builder">
      <header className="builder-bar">
        <div className="builder-bar-left">
          <Link to="/workflows" className="icon-btn" aria-label="Back to workflows">
            <ArrowLeft size={17} />
          </Link>
          <div className="builder-title-block">
            {wf ? <div className="builder-title">{wf.name}</div> : <Skeleton w={180} h={16} />}
            <div className="builder-meta">
              {wf && <VersionBadge published={wf.publishedVersion} draft={detail.data?.draft?.version ?? null} />}
              {wf?.paused && (
                <Badge tone="warning" dot>
                  Paused
                </Badge>
              )}
              {dirty && (
                <span className="unsaved">
                  <span className="badge-dot" /> Unsaved changes
                </span>
              )}
              {!dirty && detail.data?.draft && <span className="muted small">Saved {timeAgo(detail.data.draft.createdAt)}</span>}
            </div>
          </div>
        </div>
        <div className="builder-bar-right">
          {versions.length > 0 && (
            <label className="version-select">
              <Eye size={14} />
              <select
                value={viewVersion ?? working?.version ?? ''}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (dirty && !confirm('Switching versions discards unsaved changes. Continue?')) return;
                  setViewVersion(v === working?.version ? null : v);
                }}
              >
                {orderBy(versions, 'version', 'desc').map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version} · {v.status}
                    {v.version === working?.version ? ' (editing)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {wf?.publishedVersion != null && (
            <Button
              icon={wf.paused ? PlayCircle : Pause}
              onClick={() => pause.toggle(wf)}
              loading={pause.pending}
              title={wf.paused ? 'Let its triggers start it again' : 'Stop its triggers from starting it, without unpublishing it'}
            >
              {wf.paused ? 'Resume' : 'Pause'}
            </Button>
          )}
          <Button icon={Copy} onClick={() => setCopyOpen(true)} disabled={!wf} title="Copy this workflow under a new name">
            Copy
          </Button>
          <Button icon={ShieldCheck} onClick={() => validateM.mutate()} loading={validateM.isPending} disabled={busy || readOnly}>
            Validate
          </Button>
          <Button icon={Save} onClick={() => save().catch(() => undefined)} loading={saveM.isPending && !publishM.isPending} disabled={busy || readOnly || !dirty}>
            Save draft
          </Button>
          <Button
            icon={Play}
            onClick={() => {
              setTestResult(null);
              setTestOpen(true);
            }}
            disabled={busy || readOnly || nodes.length === 0}
          >
            Test run
          </Button>
          <Button variant="primary" icon={Rocket} onClick={() => publishM.mutate()} loading={publishM.isPending} disabled={busy || !canPublish}>
            Publish
          </Button>
        </div>
      </header>

      {wf?.paused && (
        <div className="paused-banner" role="status">
          <Pause size={14} /> Paused{wf.pausedAt ? ` ${timeAgo(wf.pausedAt)}` : ''}: its endpoints answer 503, and schedules, events, record changes and Run workflow
          steps don’t start it. Test runs still work.
          <button className="link-inline" onClick={() => pause.toggle(wf)} disabled={pause.pending}>
            Resume
          </button>
        </div>
      )}

      {readOnly && shown && (
        <div className="readonly-banner">
          <Eye size={14} /> Viewing v{shown.version} ({shown.status}). Read-only.
          <button className="link-inline" onClick={() => setViewVersion(null)}>
            Back to v{working?.version}
          </button>
        </div>
      )}

      <div className={`builder-body${paletteOpen ? ' palette-open' : ''}${selected ? ' has-selection' : ''}`}>
        <Palette
          catalog={catalogQ.data ?? []}
          loading={catalogQ.isLoading}
          disabled={readOnly}
          hasTrigger={hasTrigger}
          onAdd={(t) => {
            addNode(t);
            setPaletteOpen(false);
          }}
          onClose={() => setPaletteOpen(false)}
        />
        {paletteOpen && <div className="panel-backdrop" onClick={() => setPaletteOpen(false)} aria-hidden />}

        <div className="builder-canvas" onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }} onDrop={onDrop}>
          {(detail.isLoading || catalogQ.isLoading || (viewingOther && otherQ.isLoading)) && (
            <div className="canvas-loading">
              <Skeleton w={240} h={86} r={12} />
              <Skeleton w={240} h={86} r={12} />
            </div>
          )}
          <ReactFlow<FlowNode, FlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
            connectionLineType={ConnectionLineType.SmoothStep}
            defaultEdgeOptions={EDGE_DEFAULTS}
            snapToGrid
            snapGrid={[8, 8]}
            minZoom={0.3}
            maxZoom={1.75}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="minimap" style={{ width: 168, height: 108 }} nodeClassName={(n) => `mm-${(n.data as FlowNode['data']).def?.category ?? 'flow'}`} />
          </ReactFlow>

          {errors && errors.length > 0 && (
            <div className="validation-panel">
              <div className="validation-head">
                <AlertTriangle size={15} />
                <strong>
                  {pluralize(errors.length, 'issue')} found
                </strong>
                <button className="icon-btn" onClick={() => setErrors(null)} aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>
                    {e.nodeId ? (
                      <button className="link-inline" onClick={() => focusNode(e.nodeId!)}>
                        {nodes.find((n) => n.id === e.nodeId)?.data.name ?? e.nodeId}
                      </button>
                    ) : (
                      <span className="muted">Workflow</span>
                    )}
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {errors && errors.length === 0 && (
            <div className="validation-panel valid">
              <div className="validation-head">
                <CircleCheck size={15} />
                <strong>No issues. Ready to publish.</strong>
                <button className="icon-btn" onClick={() => setErrors(null)} aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
          {!readOnly && !selected && (
            <button type="button" className="btn btn-primary btn-md builder-fab" onClick={() => setPaletteOpen(true)}>
              <Plus size={16} /> Add step
            </button>
          )}
          {!detail.isLoading && !catalogQ.isLoading && nodes.length === 0 && (
            <div className="canvas-empty">
              <div className="empty-title">Empty canvas</div>
              <p className="empty-desc">Add a trigger from the palette to get started.</p>
            </div>
          )}
        </div>

        <Inspector
          node={selected}
          events={eventsQ.data ?? []}
          readOnly={readOnly}
          onChange={updateNode}
          onDelete={deleteNode}
          dataPaths={workflowDataPaths(nodes, sourcesQ.data)}
          hintPaths={selected ? hintPathsFor(selected.id) : []}
          triggerKind={triggerKind}
          onClose={deselect}
        />
      </div>

      <TestRunModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        running={testM.isPending}
        dirty={dirty}
        onRun={(input) => testM.mutate(input)}
        triggerKind={triggerKind}
        workflowId={id}
        result={testResult}
      />
      <DuplicateWorkflowModal
        source={copyOpen && wf ? wf : null}
        onClose={() => setCopyOpen(false)}
        version={viewVersion ?? undefined}
        note={dirty ? 'Unsaved changes are not included — save the draft first to copy them.' : undefined}
      />
    </div>
  );
}

function VersionBadge({ published, draft }: VersionBadgeProps) {
  return (
    <span className="version-badges">
      {published ? (
        <Badge tone="success" dot>
          v{published} published
        </Badge>
      ) : (
        <Badge>Never published</Badge>
      )}
      {draft && draft !== published && <Badge tone="neutral">v{draft} draft</Badge>}
    </span>
  );
}
