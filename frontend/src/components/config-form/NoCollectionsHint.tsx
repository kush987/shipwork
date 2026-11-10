import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Help text of a collection setting while the tenant has no collections. */
export function NoCollectionsHint() {
  return (
    <>
      No collections yet —{' '}
      <Link to="/data" className="link-inline" target="_blank" rel="noreferrer">
        create one on the Data page <ExternalLink size={12} />
      </Link>
    </>
  );
}
