import { useNavigate } from 'react-router-dom';
import type { WorkflowLinksProps } from './shared.types';

/** Comma-separated inline buttons, each opening its workflow. */
export function WorkflowLinks({ workflows }: WorkflowLinksProps) {
  const navigate = useNavigate();
  return (
    <>
      {workflows.map((w, i) => (
        <span key={w.id}>
          {i > 0 && ', '}
          <button type="button" className="link-inline" onClick={() => navigate(`/workflows/${w.id}`)}>
            {w.name}
          </button>
        </span>
      ))}
    </>
  );
}
