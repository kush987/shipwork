import { UpstreamError } from '../../../shared/domain/errors';

/**
 * The sandbox couldn't take or finish the job for reasons outside the user's code (pool full,
 * thread crashed, shutting down). Not a SandboxError: workflow steps retry it with backoff, and
 * HTTP callers (e.g. "Run test" in the editor) get 503 Service Unavailable.
 */
export class SandboxUnavailableError extends UpstreamError {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxUnavailableError';
  }
}
