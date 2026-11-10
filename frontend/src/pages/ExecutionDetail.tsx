import { useMutation, useQuery } from '@tanstack/react-query';
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow } from '@xyflow/react';
import { ArrowLeft, ChevronDown, ChevronRight, Reply, RotateCcw, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { NodeExecution } from '../api/types';
import { CATALOG_STALE_MS, RUN_WORKFLOW_NODE_TYPE } from '../builder/builder.constants';
import { catalogByType } from '../builder/builder.helpers';
import type { FlowEdge, FlowNode } from '../builder/builder.types';
import { toFlow } from '../builder/convert';
import { NODE_TYPES } from '../builder/node-types.constants';
import { fitReadable } from '../builder/viewport';
import { HttpResponseView } from '../components/HttpResponseView';
import { ModeBadge } from '../components/ModeBadge';
import { Badge, Button, EmptyState, ErrorState, JsonBlock, Skeleton, StatusPill } from '../components/ui';
import { useToast } from '../components/useToast';
import { ACTIVE_EXECUTION_STATUSES } from '../lib/executions.constants';
import { formatDateTime, formatDuration, httpStatusLabel, pluralize, shortId, triggerLabel } from '../lib/format';
import { nodeIcon } from '../lib/icons';
import { EXECUTION_REFETCH_MS } from './ExecutionDetail.constants';
import type { ExecSummaryProps, TimelineItemProps, TimelineResponseProps, TimelineTriggerProps } from './ExecutionDetail.types';

export function ExecutionDetailPage() {
  return (
    <ReactFlowProvider>
      <ExecutionDetail />
    </ReactFlowProvider>
  );
}

function ExecutionDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const rf = useReactFlow();

  const q = useQuery({
    queryKey: ['execution', id],
    queryFn: () => api.getExecution(id),
    refetchInterval: (query) => (query.state.data && ACTIVE_EXECUTION_STATUSES.includes(query.state.data.execution.status) ? EXECUTION_REFETCH_MS : false),
  });
  // Short stale time so custom nodes created in another tab show up when you come back.
  const catalogQ = useQuery({ queryKey: ['catalog'], queryFn: api.nodeCatalog, staleTime: CATALOG_STALE_MS });
  const catalog = useMemo(() => catalogByType(catalogQ.data), [catalogQ.data]);

  const replay = useMutation({
    mutationFn: () => api.replay(id),
    onSuccess: ({ executionId }) => {
      toast.info('Replay started');
      navigate(`/executions/${executionId}`);
    },
    onError: (e: Error) => toast.error('Replay failed', e.message),
  });

  const ex = q.data?.execution;
  const [focused, setFocused] = useState<string | null>(null);

  // Latest NodeExecution per node, for colouring the graph.
  const latestByNode = useMemo(() => {
    const m = new Map<string, NodeExecution>();
    for (const n of ex?.nodeExecutions ?? []) m.set(n.nodeId, n);
    return m;
  }, [ex?.nodeExecutions]);

  const { nodes, edges } = useMemo(() => {
    if (!q.data || !catalogQ.data) return { nodes: [] as FlowNode[], edges: [] as FlowEdge[] };
    const flow = toFlow(q.data.definition, catalog, { readOnly: true });
    const finished = !ACTIVE_EXECUTION_STATUSES.includes(q.data.execution.status);
    const nodes = flow.nodes.map((n) => {
      const exec = latestByNode.get(n.id);
      return { ...n, selected: n.id === focused, data: { ...n.data, exec, execSkipped: !exec && finished } };
    });
    // Highlight edges actually traversed: source ran and exited through this handle, target ran.
    const edges = flow.edges.map((e) => {
      const src = latestByNode.get(e.source);
      const traversed = !!src && (src.outputHandle ?? 'default') === (e.sourceHandle ?? 'default') && latestByNode.has(e.target);
      const live = traversed && latestByNode.get(e.target)?.status === 'running';
      return { ...e, animated: live, className: traversed ? 'edge-traversed' : 'edge-idle' };
    });
    return { nodes, edges };
  }, [q.data, catalogQ.data, catalog, latestByNode, focused]);

  // Merge into persisted node state so React Flow keeps each node's `measured` size across polls.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowNode>([]);
  useEffect(() => {
    setRfNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return nodes.map((n) => {
        const p = byId.get(n.id);
        return p ? { ...p, data: n.data, selected: n.selected } : n;
      });
    });
  }, [nodes, setRfNodes]);

  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (!fitted && nodes.length) {
      setFitted(true);
      requestAnimationFrame(() => fitReadable(rf));
    }
  }, [nodes.length, fitted, rf]);

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="page">
        {notFound ? (
          <EmptyState title="Execution not found" action={<Link to="/executions" className="btn btn-primary btn-md">All executions</Link>} />
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </div>
    );
  }

  return (
    <div className="builder">
      <header className="builder-bar">
        <div className="builder-bar-left">
          <Link to="/executions" className="icon-btn" aria-label="Back to executions">
            <ArrowLeft size={17} />
          </Link>
          <div className="builder-title-block">
            {ex ? (
              <div className="builder-title">
                {ex.workflowName} <span className="muted mono small">#{shortId(ex.id)}</span>
              </div>
            ) : (
              <Skeleton w={220} h={16} />
            )}
            {ex && (
              <div className="builder-meta">
                <StatusPill status={ex.status} />
                <Badge>v{ex.workflowVersion}</Badge>
                <ModeBadge mode={ex.mode} />
                <span className="muted small mono">{triggerLabel(ex.trigger?.event)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="builder-bar-right">
          {ex && (
            <Link to={`/workflows/${ex.workflowId}`} className="btn btn-secondary btn-md">
              <Workflow size={15} /> Open workflow
            </Link>
          )}
          <Button icon={RotateCcw} onClick={() => replay.mutate()} loading={replay.isPending} disabled={!ex || ACTIVE_EXECUTION_STATUSES.includes(ex.status)}>
            Replay
          </Button>
        </div>
      </header>

      <div className="exec-body">
        <div className="builder-canvas">
          {(q.isLoading || catalogQ.isLoading) && (
            <div className="canvas-loading">
              <Skeleton w={240} h={86} r={12} />
              <Skeleton w={240} h={86} r={12} />
            </div>
          )}
          <ReactFlow<FlowNode, FlowEdge>
            nodes={rfNodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={(changes) => onNodesChange(changes.filter((c) => c.type === 'dimensions'))}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, n) => setFocused(n.id)}
            onPaneClick={() => setFocused(null)}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={1.75}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {ex && <ExecSummary ex={ex} />}
        </div>

        <aside className="timeline-panel">
          <div className="panel-header">
            <div className="panel-title">Timeline</div>
            <div className="panel-sub">{ex ? pluralize(ex.nodeExecutions.length, 'node run') : 'Loading…'}</div>
          </div>
          <div className="timeline-scroll">
            {ex?.error && (
              <div className="exec-error">
                <strong>Execution failed.</strong> {ex.error}
              </div>
            )}
            {ex && <TimelineTrigger ex={ex} />}
            {ex?.response && <TimelineResponse response={ex.response} />}
            {ex?.nodeExecutions.map((n, i) => (
              <TimelineItem
                key={`${n.nodeId}-${i}`}
                n={n}
                category={catalog.get(n.nodeType)?.category}
                icon={catalog.get(n.nodeType)?.icon}
                focused={focused === n.nodeId}
                onFocus={() => {
                  setFocused(n.nodeId);
                  const node = rf.getNode(n.nodeId);
                  if (node) rf.setCenter(node.position.x + 120, node.position.y + 40, { zoom: 1.05, duration: 300 });
                }}
              />
            ))}
            {ex && ACTIVE_EXECUTION_STATUSES.includes(ex.status) && (
              <div className="timeline-pending">
                <span className="pulse-dot" /> {ex.status === 'waiting' ? 'Waiting on a delay…' : 'Running…'}
              </div>
            )}
            {q.isLoading &&
              [0, 1, 2].map((i) => (
                <div key={i} className="tl-item">
                  <Skeleton w="80%" h={12} />
                </div>
              ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** The run that started this one through a Run workflow step, if any. */
const calledByOf = (data: unknown): { executionId: string; workflowName?: string | null } | null => {
  const calledBy = (data as { calledBy?: { executionId?: unknown; workflowName?: string | null } } | null)?.calledBy;
  return typeof calledBy?.executionId === 'string' ? { executionId: calledBy.executionId, workflowName: calledBy.workflowName } : null;
};

/** The run a Run workflow step started, from its output. */
const startedRunOf = (n: NodeExecution): string | null => {
  const id = n.nodeType === RUN_WORKFLOW_NODE_TYPE ? (n.output as { executionId?: unknown } | null)?.executionId : null;
  return typeof id === 'string' ? id : null;
};

function ExecSummary({ ex }: ExecSummaryProps) {
  const calledBy = calledByOf(ex.trigger?.data);
  return (
    <div className="exec-summary">
      <div>
        <span className="label">Started</span>
        <span>{formatDateTime(ex.startedAt)}</span>
      </div>
      <div>
        <span className="label">Duration</span>
        <span className="mono">{ACTIVE_EXECUTION_STATUSES.includes(ex.status) ? 'running…' : formatDuration(ex.durationMs)}</span>
      </div>
      {ex.response && (
        <div>
          <span className="label">Response</span>
          <span className="mono">{httpStatusLabel(ex.response.statusCode)}</span>
        </div>
      )}
      {calledBy && (
        <div>
          <span className="label">Called by</span>
          <Link to={`/executions/${calledBy.executionId}`} className="link-inline">
            {calledBy.workflowName ?? shortId(calledBy.executionId)}
          </Link>
        </div>
      )}
      <div>
        <span className="label">Trace</span>
        <span className="mono" title={ex.traceId}>
          {ex.traceId ? shortId(ex.traceId) : '—'}
        </span>
      </div>
    </div>
  );
}

function TimelineTrigger({ ex }: TimelineTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-item">
      <button className="tl-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="tl-dot tl-dot-trigger" />
        <span className="tl-name">Trigger · {triggerLabel(ex.trigger?.event)}</span>
        <span className="tl-meta">{formatDateTime(ex.startedAt)}</span>
      </button>
      {open && (
        <div className="tl-detail">
          <JsonBlock label="Trigger data" value={ex.trigger?.data} />
          <JsonBlock label="Context" value={ex.context} />
        </div>
      )}
    </div>
  );
}

/** What the API caller got back (set by the first "Return response" step). */
function TimelineResponse({ response }: TimelineResponseProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="tl-item tl-response">
      <button className="tl-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="tl-icon cat-response">
          <Reply size={13} />
        </span>
        <span className="tl-name">Response to the caller</span>
        <span className="tl-meta mono">{response.statusCode}</span>
      </button>
      {open && (
        <div className="tl-detail">
          <HttpResponseView status={response.statusCode} headers={response.headers} body={response.body} />
        </div>
      )}
    </div>
  );
}

function TimelineItem({
  n,
  category,
  icon,
  focused,
  onFocus,
}: TimelineItemProps) {
  const [open, setOpen] = useState(n.status === 'failed');
  const Icon = nodeIcon(icon, category as never);
  const startedRun = startedRunOf(n);
  return (
    <div className={`tl-item ${focused ? 'focused' : ''} tl-${n.status}`}>
      <button
        className="tl-head"
        onClick={() => {
          setOpen((o) => !o);
          onFocus();
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className={`tl-icon cat-${category ?? 'flow'}`}>
          <Icon size={13} />
        </span>
        <span className="tl-name">{n.nodeName}</span>
        <span className="tl-meta">
          {n.attempt > 1 && <Badge tone="warning">attempt {n.attempt}</Badge>}
          <StatusPill status={n.status} />
          <span className="mono">{formatDuration(n.durationMs)}</span>
        </span>
      </button>
      {open && (
        <div className="tl-detail">
          <div className="tl-facts">
            <span className="mono">{n.nodeType}</span>
            {n.outputHandle && (
              <span>
                → output <strong className="mono">{n.outputHandle}</strong>
              </span>
            )}
            <span>{formatDateTime(n.startedAt)}</span>
            {startedRun && (
              <Link to={`/executions/${startedRun}`} className="link-inline">
                Open the run it started
              </Link>
            )}
          </div>
          {n.error && <JsonBlock label="Error" value={n.error} tone="danger" />}
          <JsonBlock label="Input" value={n.input} />
          <JsonBlock label="Output" value={n.output} />
        </div>
      )}
    </div>
  );
}
