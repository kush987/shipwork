import { CircleCheck, TriangleAlert, Workflow as WorkflowIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui';
import { pluralize } from '../../lib/format';
import type { EndpointViewProps } from './endpoints.types';

/** "Ready" or "N issues" (issues listed in the tooltip). */
export function ReadyBadge({ endpoint: ep }: EndpointViewProps) {
  if (ep.ready) {
    return (
      <Badge tone="success" dot>
        Ready
      </Badge>
    );
  }
  const n = ep.issues.length;
  return (
    <span title={ep.issues.join('\n')}>
      <Badge tone={ep.enabled ? 'warning' : 'neutral'} dot>
        {!ep.enabled ? 'Disabled' : pluralize(n, 'issue')}
      </Badge>
    </span>
  );
}

/** Link to the workflow an endpoint runs. */
export function WorkflowLink({ endpoint: ep }: EndpointViewProps) {
  if (!ep.workflow) return <span className="muted small">Missing workflow</span>;
  return (
    <Link to={`/workflows/${ep.workflow.id}`} className="workflow-link" onClick={(e) => e.stopPropagation()}>
      <WorkflowIcon size={12} /> {ep.workflow.name}
    </Link>
  );
}

/** Whether the endpoint answers calls, and if not, what to fix. */
export function ReadinessPanel({ endpoint: ep }: EndpointViewProps) {
  if (ep.ready) {
    return (
      <div className="readiness readiness-ok">
        <CircleCheck size={16} />
        <div>
          <strong>Live.</strong> Calls run{' '}
          {ep.workflow ? (
            <Link to={`/workflows/${ep.workflow.id}`} className="link-inline">
              {ep.workflow.name}
            </Link>
          ) : (
            'its workflow'
          )}
          {ep.workflow?.publishedVersion ? ` v${ep.workflow.publishedVersion}` : ''}.
        </div>
      </div>
    );
  }
  return (
    <div className="readiness readiness-issues" role="status">
      <TriangleAlert size={16} />
      <div>
        <strong>Not answering calls yet.</strong>
        <ul>
          {ep.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        {ep.workflow && (
          <Link to={`/workflows/${ep.workflow.id}`} className="link-inline">
            <WorkflowIcon size={13} /> Open workflow “{ep.workflow.name}”
          </Link>
        )}
      </div>
    </div>
  );
}
