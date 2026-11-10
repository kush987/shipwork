import { useEffect, useState } from 'react';
import { CopyButton } from '../../components/CopyButton';
import { Button, Modal } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { TestTokenForm } from './TestTokenForm';
import type { ProviderToolProps } from './sign-in.types';

/** Issues a token for a made-up user, to paste into an endpoint's Try-it console or your own client. */
export function TestTokenModal({ provider, onClose }: ProviderToolProps) {
  const [token, setToken] = useState<{ value: string; expiresAt: string } | null>(null);
  useEffect(() => setToken(null), [provider?.id]);
  return (
    <Modal
      open={!!provider}
      onClose={onClose}
      width={560}
      title="Get a test token"
      description={provider ? `Signed by “${provider.name}”, exactly like your Login API’s Issue token step would.` : undefined}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {provider && (
        <div className="form-stack">
          <TestTokenForm provider={provider} onIssued={(value, expiresAt) => setToken({ value, expiresAt })} />
          {token && (
            <div className="issued-token">
              <div className="issued-token-head">
                <span className="field-label">Token</span>
                <span className="muted small">expires {formatDateTime(token.expiresAt)}</span>
                <CopyButton text={token.value} label="Copy token" />
              </div>
              <pre className="json-pre code-block token-value">{token.value}</pre>
              <p className="muted small" style={{ margin: 0 }}>
                Send it as <span className="mono">Authorization: Bearer …</span> to endpoints that use this provider.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
