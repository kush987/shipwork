import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NoSettingsNoteProps } from './builder.types';

/** Shown for nodes without settings; trigger nodes started by an endpoint point to the Endpoints page. */
export function NoSettingsNote({ triggerKind }: NoSettingsNoteProps) {
  if (triggerKind === 'http') {
    return (
      <p className="muted small">
        Started by an API endpoint. Bind this workflow to one on the{' '}
        <Link to="/endpoints" className="link-inline" target="_blank" rel="noreferrer">
          Endpoints page <ExternalLink size={12} />
        </Link>
        ; the call is available as <span className="mono">request.*</span>.
      </p>
    );
  }
  return <p className="muted small">This node has no settings. It works from the shipment context.</p>;
}
