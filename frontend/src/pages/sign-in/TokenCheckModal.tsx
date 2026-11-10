import { useMutation } from '@tanstack/react-query';
import { CircleCheck, CircleX, ScanSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, JsonBlock, Modal } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import type { ProviderToolProps } from './sign-in.types';

/** Paste a token and see what ShipFlow reads from it: valid or not, user id, roles and claims. */
export function TokenCheckModal({ provider, onClose }: ProviderToolProps) {
  const [token, setToken] = useState('');
  const check = useMutation({ mutationFn: () => api.verifyToken(provider!.id, token.trim()) });
  useEffect(() => {
    setToken('');
    check.reset();
  }, [provider?.id]);

  const result = check.data;
  return (
    <Modal
      open={!!provider}
      onClose={onClose}
      width={600}
      title="Check a token"
      description={provider ? `Verified with “${provider.name}” — the same check JWT endpoints run.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={ScanSearch} loading={check.isPending} disabled={!token.trim()} onClick={() => check.mutate()}>
            Check token
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="Token">
          <textarea
            className="input mono"
            rows={4}
            spellCheck={false}
            placeholder="eyJhbGciOi…"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              check.reset();
            }}
          />
        </Field>
        {check.isError && <p className="field-error">{check.error instanceof Error ? check.error.message : 'Could not check the token'}</p>}
        {result &&
          (result.ok ? (
            <div className="token-check is-ok">
              <div className="result-ok">
                <CircleCheck size={15} /> Valid · user <span className="mono">{result.sub}</span>
              </div>
              <dl className="token-facts">
                <dt>Roles</dt>
                <dd>{result.roles.length ? result.roles.join(', ') : <span className="muted">none</span>}</dd>
                <dt>Expires</dt>
                <dd>{result.expiresAt ? formatDateTime(result.expiresAt) : <span className="muted">never</span>}</dd>
              </dl>
              <JsonBlock label="Claims (request.auth.claims)" value={result.claims} />
            </div>
          ) : (
            <div className="token-check is-fail">
              <span className="result-fail">
                <CircleX size={15} /> {result.error}
              </span>
            </div>
          ))}
      </div>
    </Modal>
  );
}
