import { DomainError, NonRetryableError, RetryableError, UpstreamError, ValidationFailedError } from '../../../shared/domain/errors';
import { OutboundHttpError } from '../../../shared/http/outbound-http';
import { OutboundResponse } from '../../../shared/http/outbound-http.types';

/**
 * Translates errors raised by services and adapters into the engine's retry vocabulary, so every
 * node classifies failures the same way:
 *   - outbound HTTP: retryable when the transport says so (timeouts, network)
 *   - upstream unavailable: retryable
 *   - any other business error (not found, invalid, validation): retrying can't help
 */
export function toStepError(error: unknown, prefix?: string): Error {
  const message = (text: string) => (prefix ? `${prefix}: ${text}` : text);
  if (error instanceof RetryableError || error instanceof NonRetryableError) return error;
  if (error instanceof OutboundHttpError) {
    return error.retryable ? new RetryableError(message(error.message)) : new NonRetryableError(message(error.message));
  }
  if (error instanceof UpstreamError) return new RetryableError(message(error.message));
  if (error instanceof ValidationFailedError) {
    return new NonRetryableError(message(error.issues.map((i) => i.message).join('; ') || error.message));
  }
  if (error instanceof DomainError) return new NonRetryableError(message(error.message));
  return error instanceof Error ? error : new Error(String(error));
}

/** Runs `fn`, rethrowing failures as step errors. */
export async function asStep<T>(fn: () => Promise<T>, prefix?: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toStepError(error, prefix);
  }
}

/** 5xx and 429 may succeed later; any other non-2xx won't. */
export function assertHttpSuccess(response: OutboundResponse, summary: string): void {
  if (response.status >= 500 || response.status === 429) throw new RetryableError(summary);
  if (!response.ok) {
    const snippet = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    throw new NonRetryableError(`${summary}: ${String(snippet).slice(0, 200)}`);
  }
}
