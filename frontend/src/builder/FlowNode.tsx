import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Braces, CircleCheck, CircleX, LoaderCircle, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { memo, useMemo } from 'react';
import { api } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { formatDuration } from '../lib/format';
import { nodeIcon } from '../lib/icons';
import { hasLogic, logicLabel, outputsOf, summarize } from './builder.helpers';
import { RUN_WORKFLOW_NODE_TYPE } from './builder.constants';
import type { ExecBadgeProps, FlowNode } from './builder.types';

function FlowNodeView({ data, selected }: NodeProps<FlowNode>) {
  const def = data.def;
  const category = def?.category ?? 'flow';
  const Icon = nodeIcon(def?.icon, def?.category);
  const outputs = outputsOf(def);
  const multi = outputs.length > 1 || (outputs[0] && outputs[0].id !== 'default' && outputs[0].label);
  const isTrigger = def?.isTrigger || category === 'trigger';
  const summary = summarize(data, useWorkflowNames(data.nodeType === RUN_WORKFLOW_NODE_TYPE));
  const hasErrors = (data.errors?.length ?? 0) > 0;
  const exec = data.exec;
  const execClass = exec ? `exec-${exec.status}` : data.execSkipped ? 'exec-skipped' : '';

  return (
    <div
      className={`fnode cat-${category} ${selected ? 'selected' : ''} ${hasErrors ? 'has-errors' : ''} ${execClass}`}
      title={hasErrors ? data.errors!.join('\n') : undefined}
    >
      {!isTrigger && <Handle type="target" position={Position.Left} className="fhandle fhandle-target" />}
      <div className="fnode-stripe" />
      <div className="fnode-head">
        <div className="fnode-icon">
          <Icon size={15} />
        </div>
        <div className="fnode-titles">
          <div className="fnode-kind">{def?.label ?? data.nodeType}</div>
          <div className="fnode-name">{data.name || def?.label || data.nodeType}</div>
        </div>
        <ExecBadge data={data} />
        {hasErrors && !exec && (
          <span className="fnode-err-icon">
            <AlertTriangle size={14} />
          </span>
        )}
      </div>
      {summary && <div className="fnode-summary">{summary}</div>}
      {hasLogic(data.logic) && (
        <div className="fnode-logic" title="This step runs your own code (Logic in its settings)">
          <Braces size={11} /> logic: {logicLabel(data.logic)}
        </div>
      )}
      {!def && <div className="fnode-summary text-danger">Unknown node type</div>}

      {multi ? (
        <div className="fnode-outputs">
          {outputs.map((o) => (
            <div
              key={o.id}
              className={`fnode-output ${exec?.outputHandle === o.id ? 'taken' : ''} out-${o.id}`}
            >
              <span>{o.label || o.id}</span>
              <Handle type="source" id={o.id} position={Position.Right} className="fhandle fhandle-source" />
            </div>
          ))}
        </div>
      ) : (
        <Handle type="source" id={outputs[0].id} position={Position.Right} className="fhandle fhandle-source" />
      )}
    </div>
  );
}

function ExecBadge({ data }: ExecBadgeProps) {
  const exec = data.exec;
  if (!exec) return null;
  const Icon =
    exec.status === 'succeeded'
      ? CircleCheck
      : exec.status === 'failed'
        ? CircleX
        : exec.status === 'retrying'
          ? RotateCcw
          : LoaderCircle;
  return (
    <span className={`fnode-exec exec-badge-${exec.status}`} title={`${exec.status} · attempt ${exec.attempt}`}>
      <Icon size={13} className={exec.status === 'running' ? 'spin' : ''} />
      {exec.durationMs !== null && <span>{formatDuration(exec.durationMs)}</span>}
      {exec.attempt > 1 && <span>×{exec.attempt}</span>}
    </span>
  );
}

export const FlowNodeComponent = memo(FlowNodeView);

/** Workflow names by id, loaded (once, shared by every card) only for Run workflow steps. */
function useWorkflowNames(enabled: boolean): Record<string, string> {
  const { data } = useQuery({ queryKey: queryKeys.workflows, queryFn: api.listWorkflows, enabled });
  return useMemo(() => Object.fromEntries((data ?? []).map((w) => [w.id, w.name])), [data]);
}
