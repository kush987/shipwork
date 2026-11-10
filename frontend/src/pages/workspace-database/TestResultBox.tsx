import { CheckCircle2, XCircle } from 'lucide-react';
import { errorMessages } from '../../lib/errors';
import type { TestResultBoxProps } from './database.types';

/** The outcome of "Test connection": where it connected and how fast, or why it couldn't. */
export function TestResultBox({ result, error }: TestResultBoxProps) {
  const failure = error ? errorMessages(error).join(' ') : result && !result.ok ? result.error : null;
  if (failure) {
    return (
      <div className="db-test is-fail" role="alert">
        <XCircle size={15} aria-hidden />
        <span>{failure}</span>
      </div>
    );
  }
  if (!result?.ok) return null;
  return (
    <div className="db-test is-ok" role="status">
      <CheckCircle2 size={15} aria-hidden />
      <span>
        Connected in {result.latencyMs} ms to <strong className="mono">{result.databaseName}</strong> on <span className="mono">{result.host}</span>.{' '}
        {result.hasWorkspaceData ? 'It already has data for this workspace.' : 'It has no data for this workspace yet.'}
      </span>
    </div>
  );
}
