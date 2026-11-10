import { AlertTriangle, CircleCheck, CircleX } from 'lucide-react';
import { CopyButton } from '../../components/CopyButton';
import { formatDuration } from '../../lib/format';
import { toJsonText } from '../../lib/json';
import { FAILED_BRANCH } from './customNodes.constants';
import { resultPaths } from './customNodes.helpers';
import type { TestResultViewProps } from './customNodes.types';

/** What a test run did: the branch, where the result is saved and how later steps read it. */
export function TestResultView({ result, running, spec, classic, saveAs }: TestResultViewProps) {
  if (running) return <div className="cn-result muted small">Running…</div>;
  if (!result) {
    return (
      <div className="cn-result cn-result-empty muted small">
        Press <strong>Run test</strong> (⌘/Ctrl+Enter) to run your code with the settings and sample data on the left.
      </div>
    );
  }

  const logs = (
    <>
      <div className="cn-result-label">Logs</div>
      <pre className="json-pre">{result.logs.length ? result.logs.join('\n') : '—'}</pre>
    </>
  );

  if (!result.ok) {
    return (
      <div className="cn-result is-fail">
        <div className="cn-result-head">
          <span className="result-fail">
            <CircleX size={14} /> {result.error}
          </span>
          <span className="muted small mono">{formatDuration(result.durationMs)}</span>
        </div>
        <p className="small cn-result-note">
          {!classic && spec.errorBranch
            ? `In a workflow the flow would continue on the “${FAILED_BRANCH.label}” branch (when it’s connected), with { error } as the output.`
            : 'In a workflow this step — and the run — would fail.'}
        </p>
        {logs}
      </div>
    );
  }

  const { outputHandle, output, context, emit } = result.result;
  const branch = spec.outputs.find((o) => o.id === outputHandle);
  const warnings = result.warnings ?? [];
  const paths = resultPaths(saveAs, output);

  return (
    <div className="cn-result is-ok">
      <div className="cn-result-head">
        <span className="result-ok">
          <CircleCheck size={14} />{' '}
          {spec.outputs.length > 1 ? (
            <>
              Continues on branch <strong>{branch?.label || outputHandle}</strong>
              <span className="mono muted"> ({outputHandle})</span>
            </>
          ) : (
            'Succeeded — the flow continues'
          )}
        </span>
        <span className="muted small mono">{formatDuration(result.durationMs)}</span>
      </div>

      {warnings.length > 0 && (
        <ul className="cn-result-warnings">
          {warnings.map((w) => (
            <li key={w}>
              <AlertTriangle size={12} /> {w}
            </li>
          ))}
        </ul>
      )}

      {classic ? (
        <>
          <div className="cn-result-label">output (shown in the run timeline)</div>
          <pre className="json-pre">{toJsonText(output)}</pre>
          <div className="cn-result-label">context (merged for later steps)</div>
          <pre className="json-pre">{toJsonText(context)}</pre>
        </>
      ) : (
        <>
          <div className="cn-result-label">
            Saved as <span className="mono cn-result-path">context.{saveAs}</span>
          </div>
          <pre className="json-pre">{toJsonText(output)}</pre>
          <div className="cn-result-label">Use in later steps</div>
          <ul className="cn-paths">
            {paths.map((p) => (
              <li key={p}>
                <span className="mono">{`{{${p}}}`}</span>
                <CopyButton text={`{{${p}}}`} label={`Copy {{${p}}}`} iconOnly />
              </li>
            ))}
          </ul>
        </>
      )}

      {emit.length > 0 && (
        <>
          <div className="cn-result-label">Would emit (not sent during tests)</div>
          <pre className="json-pre">{emit.map((e) => `${e.event}  ${JSON.stringify(e.payload)}`).join('\n')}</pre>
        </>
      )}
      {logs}
    </div>
  );
}
