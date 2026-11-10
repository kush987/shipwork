import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HTTP_TRIGGER_EVENT } from '../../lib/endpoints.constants';
import type { WorkflowHintProps } from './config-form.types';

/** Help under a Run workflow step's workflow: which version runs (or what it still needs), and a link to open it. */
export function WorkflowHint({ workflow }: WorkflowHintProps) {
  const open = (
    <Link to={`/workflows/${workflow.id}`} className="link-inline" target="_blank" rel="noreferrer">
      open <ExternalLink size={11} />
    </Link>
  );
  if (workflow.publishedVersion === null) {
    return <span className="source-hint">Not published yet — publish “{workflow.name}” first, then this workflow · {open}</span>;
  }
  if (workflow.triggerEvent !== HTTP_TRIGGER_EVENT) {
    return <span className="source-hint">“{workflow.name}” doesn’t start with an API request, so it can’t be run from here · {open}</span>;
  }
  return (
    <span className="source-hint">
      Runs its published version (v{workflow.publishedVersion}) with the request below; what its Return response answers is saved · {open}
    </span>
  );
}
