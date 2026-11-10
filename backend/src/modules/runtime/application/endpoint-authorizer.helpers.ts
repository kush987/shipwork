import { isPlainObject } from '../../../shared/util/json-setting';
import { ACCESS_DECISION_HEADER } from '../../nodes/domain/access-decision.constants';
import type { SyncRunResult } from '../../execution/application/sync-execution.runner.types';
import type { AuthorizerDecision } from './endpoint-authorizer.types';

const deny = (status: number, error: string, message: string): AuthorizerDecision => ({ allow: false, status, error, message });

/**
 * Only an explicit "allow" from an Access decision step lets a call through (fail closed):
 * a deny decision, any other response, no response, a failed or slow run all refuse it.
 */
export function decisionOf(run: SyncRunResult, timeoutMs: number): AuthorizerDecision {
  if (run.kind === 'timeout') return deny(503, 'authorizer_failed', `The authorizer took longer than ${timeoutMs / 1000} s`);
  if (run.kind === 'completed') {
    return run.status === 'failed'
      ? deny(503, 'authorizer_failed', `The authorizer failed: ${run.error ?? 'unknown error'}`)
      : deny(403, 'forbidden', 'The authorizer did not allow this call (no Access decision step ran)');
  }
  const { statusCode, headers, body } = run.response;
  const marker = headers[ACCESS_DECISION_HEADER];
  const decided = isPlainObject(body) ? body : {};
  if (marker === 'allow') return { allow: true, context: isPlainObject(decided.context) ? decided.context : {} };
  if (marker === 'deny') return deny(statusCode, statusCode === 401 ? 'unauthorized' : 'forbidden', String(decided.message ?? 'Access denied'));
  // A plain "Return response" in an authorizer: its error answer goes to the caller as is.
  if (statusCode >= 400) return { allow: false, status: statusCode, error: 'forbidden', message: 'Access denied', body, headers };
  return deny(403, 'forbidden', 'The authorizer did not allow this call (use an Access decision step)');
}
