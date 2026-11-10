import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '../../components/CopyButton';
import { MethodBadge } from '../../components/MethodBadge';
import { endpointUrl } from '../../lib/endpoints';
import { API_KEY_PLACEHOLDER, SNIPPET_LABELS, TOKEN_PLACEHOLDER } from './endpoints.constants';
import { snippetFor } from './endpoints.helpers';
import type { EndpointViewProps, SnippetKind } from './endpoints.types';
import { SIGN_IN_PROVIDERS_PATH } from '../../components/config-form/config-form.constants';

/** The endpoint's public URL plus copy-ready code to call it. */
export function ConnectCard({ endpoint: ep }: EndpointViewProps) {
  const [kind, setKind] = useState<SnippetKind>('curl');
  const url = endpointUrl(ep);
  const code = snippetFor(kind, ep);
  return (
    <section className="card panel-card">
      <header className="panel-card-head">
        <h2 className="section-title">Call it</h2>
      </header>
      <div className="panel-card-body">
        <div className="url-box">
          <MethodBadge method={ep.method} />
          <span className="mono url-text" title={url}>
            {url}
          </span>
          <CopyButton text={url} label="Copy URL" iconOnly />
        </div>
        <div className="snippet-head">
          <div className="segmented" role="tablist" aria-label="Snippet language">
            {(Object.keys(SNIPPET_LABELS) as SnippetKind[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {SNIPPET_LABELS[k]}
              </button>
            ))}
          </div>
          <CopyButton text={code} />
        </div>
        <pre className="json-pre code-block snippet">{code}</pre>
        {ep.auth === 'jwt' && (
          <p className="muted small" style={{ margin: 0 }}>
            Replace <span className="mono">{TOKEN_PLACEHOLDER}</span> with the signed-in user’s token (from your Login API or identity provider).{' '}
            <Link to={SIGN_IN_PROVIDERS_PATH} className="link-inline">
              App sign-in
            </Link>{' '}
            can issue a test token.
          </p>
        )}
        {ep.auth === 'api_key' && (
          <p className="muted small" style={{ margin: 0 }}>
            Replace <span className="mono">{API_KEY_PLACEHOLDER}</span> with a key from{' '}
            <Link to="/api-keys" className="link-inline">
              API keys
            </Link>
            . Keep keys on your server, not in browser code.
          </p>
        )}
      </div>
    </section>
  );
}
