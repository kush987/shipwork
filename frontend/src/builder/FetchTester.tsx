import { useMutation } from '@tanstack/react-query';
import { CircleCheck, CircleX, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { FetchTestResult } from '../api/types';
import { Button } from '../components/ui';
import { formatDuration } from '../lib/format';
import { FETCH_DEFAULT_SAVE_AS } from './builder.constants';
import { fieldNameFor, parseExtract } from './builder.helpers';
import type { FetchTesterProps } from './builder.types';

/**
 * Runs the Fetch data step's request against a real shipment from the builder, shows the
 * response, and lets the user click a field to add it to "Extract fields".
 */
export function FetchTester({
  config,
  readOnly,
  onExtractChange,
}: FetchTesterProps) {
  const [result, setResult] = useState<FetchTestResult | null>(null);
  const [showBody, setShowBody] = useState(false);
  const test = useMutation({
    mutationFn: () => api.testFetchData(config),
    onSuccess: setResult,
    onError: (e: Error) => setResult({ ok: false, error: e.message, sample: null }),
  });

  const extract = parseExtract(config.extract);
  const saveAs = String(config.saveAs || FETCH_DEFAULT_SAVE_AS);
  const extracted = new Set(Object.values(extract));
  const addField = (path: string) => {
    const name = fieldNameFor(path, new Set(Object.keys(extract)));
    onExtractChange(JSON.stringify({ ...extract, [name]: path }, null, 2));
  };
  const removeField = (name: string) => {
    const next = { ...extract };
    delete next[name];
    onExtractChange(JSON.stringify(next, null, 2));
  };

  return (
    <div className="fetch-tester">
      <div className="fetch-tester-head">
        <span className="field-label">Try it</span>
        <Button size="sm" icon={Play} loading={test.isPending} disabled={!config.url} onClick={() => test.mutate()}>
          Test request
        </Button>
      </div>

      {Object.keys(extract).length > 0 && (
        <div className="fetch-uses">
          <span className="muted small">Use in next steps:</span>
          {Object.keys(extract).map((k) => (
            <span key={k} className="fetch-use">
              <code>{`{{context.${saveAs}.${k}}}`}</code>
              {!readOnly && (
                <button type="button" aria-label={`Stop extracting ${k}`} title="Remove" onClick={() => removeField(k)}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {result && (
        <div className={`fetch-result ${result.ok ? 'is-ok' : 'is-fail'}`}>
          <div className="fetch-result-head">
            {result.ok ? (
              <span className="result-ok">
                <CircleCheck size={14} /> {result.status}
              </span>
            ) : (
              <span className="result-fail">
                <CircleX size={14} /> {result.error ?? `HTTP ${result.status}`}
              </span>
            )}
            {result.durationMs !== undefined && <span className="muted small mono">{formatDuration(result.durationMs)}</span>}
          </div>
          {result.sample && (
            <div className="muted small">
              Placeholders filled from shipment <span className="mono">{result.sample.orderId}</span>
              {result.request && (
                <>
                  {' '}
                  · <span className="mono">{result.request.method}</span> <span className="mono fetch-url">{result.request.url}</span>
                </>
              )}
            </div>
          )}
          {result.saved && (
            <>
              <div className="cn-result-label">saved as context.{saveAs}</div>
              <pre className="json-pre">{JSON.stringify(result.saved, null, 2)}</pre>
              {result.missing && result.missing.length > 0 && (
                <div className="field-error">Not in this response: {result.missing.join(', ')}</div>
              )}
            </>
          )}
          {result.paths && result.paths.length > 0 && (
            <>
              <div className="cn-result-label">response fields — click to extract</div>
              <ul className="fetch-paths">
                {result.paths.map((p) => (
                  <li key={p.path}>
                    <button
                      type="button"
                      disabled={readOnly || extracted.has(p.path)}
                      onClick={() => addField(p.path)}
                      title={extracted.has(p.path) ? 'Already extracted' : `Extract ${p.path}`}
                    >
                      <span className="mono fetch-path">{p.path}</span>
                      <span className="mono fetch-preview">{p.preview}</span>
                      {extracted.has(p.path) ? <CircleCheck size={12} /> : <Plus size={12} />}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.body && (
            <button type="button" className="link-inline small" onClick={() => setShowBody((s) => !s)}>
              {showBody ? 'Hide' : 'Show'} raw response
            </button>
          )}
          {showBody && result.body && <pre className="json-pre">{result.body}</pre>}
        </div>
      )}
    </div>
  );
}
