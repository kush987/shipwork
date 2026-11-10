import { useMutation } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { HttpResponseView } from '../../components/HttpResponseView';
import { JsonField } from '../../components/JsonField';
import { Button, Field } from '../../components/ui';
import { methodHasBody, pathParams, resolvePath, sampleFromSchema } from '../../lib/endpoints';
import { useJsonText } from '../../lib/useJsonText';
import type { TryItConsoleProps } from './endpoints.types';
import { useAuthProviders, useSessionApiKey, useSessionToken } from './hooks';
import { TestTokenShortcut } from './TestTokenShortcut';

/** Calls the live endpoint through the runtime gateway, exactly like an external client would. */
export function TryItConsole({ endpoint: ep, stale }: TryItConsoleProps) {
  const hasBody = methodHasBody(ep.method);
  const params = pathParams(ep.path);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const query = useJsonText({}, { expect: 'object' });
  const body = useJsonText(hasBody ? sampleFromSchema(ep.requestSchema) : '', { expect: 'any' });
  const [apiKey, setApiKey] = useSessionApiKey();
  const [token, setToken] = useSessionToken();
  const providers = useAuthProviders(ep.auth === 'jwt');
  const provider = providers.data?.find((p) => p.id === ep.authProviderId);

  // Re-seed the inputs only when the saved route or schema changes (not on every refetch).
  const shapeKey = `${ep.method} ${ep.path} ${JSON.stringify(ep.requestSchema)}`;
  useEffect(() => {
    const sample = sampleFromSchema(ep.requestSchema);
    query.reset(hasBody ? {} : sample);
    body.reset(hasBody ? sample : '');
  }, [shapeKey]);

  const send = useMutation({
    mutationFn: () =>
      api.callRuntime({
        method: ep.method,
        path: resolvePath(ep.path, paramValues),
        query: query.value as Record<string, unknown> | undefined,
        body: hasBody ? body.value : undefined,
        apiKey: ep.auth === 'api_key' ? apiKey.trim() || undefined : undefined,
        bearer: ep.auth === 'jwt' ? token.trim() || undefined : undefined,
      }),
  });

  const missingParam = params.find((p) => !paramValues[p]?.trim());
  const canSend = !missingParam && query.valid && body.valid;

  return (
    <section className="card panel-card">
      <header className="panel-card-head">
        <h2 className="section-title">Try it</h2>
        {stale && <span className="muted small">Uses the saved version</span>}
      </header>
      <form
        className="panel-card-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) send.mutate();
        }}
      >
        {params.length > 0 && (
          <div className="form-grid">
            {params.map((p) => (
              <Field key={p} label={`:${p}`} required>
                <input
                  className="input mono"
                  value={paramValues[p] ?? ''}
                  onChange={(e) => setParamValues((v) => ({ ...v, [p]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        )}
        <JsonField label="Query parameters" state={query} rows={hasBody ? 2 : 4} help={hasBody ? undefined : 'Checked against the request schema'} />
        {hasBody && <JsonField label="Request body" state={body} rows={7} help="JSON, checked against the request schema" />}
        {ep.auth === 'api_key' && (
          <Field label="API key" help="Sent as x-api-key. Remembered in this tab only.">
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              placeholder="sk_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
        )}
        {ep.auth === 'jwt' && (
          <Field label="Sign-in token" help="Sent as Authorization: Bearer. Remembered in this tab only.">
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              placeholder="eyJhbGciOi…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>
        )}
        {ep.auth === 'jwt' && provider?.type === 'shipflow' && <TestTokenShortcut provider={provider} onToken={setToken} />}
        <div className="try-actions">
          <span className="muted small mono try-target">
            {ep.method} {resolvePath(ep.path, paramValues)}
          </span>
          <Button type="submit" variant="primary" icon={Send} loading={send.isPending} disabled={!canSend}>
            Send
          </Button>
        </div>
        {send.isError && <div className="error-state">{send.error instanceof Error ? send.error.message : 'Request failed'}</div>}
        {send.data && (
          <HttpResponseView
            status={send.data.status}
            statusText={send.data.statusText}
            headers={send.data.headers}
            body={send.data.body}
            durationMs={send.data.durationMs}
            executionId={send.data.executionId}
          />
        )}
      </form>
    </section>
  );
}
