import { ValidationIssue } from './errors.types';

/** Base class for errors that carry business meaning. Mapped to HTTP codes by DomainExceptionFilter. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(entity: string, id: string) {
    super(`${entity} '${id}' not found`);
  }
}

export class InvalidOperationError extends DomainError {
  readonly code = 'INVALID_OPERATION';
}

/** An external dependency (e.g. a courier API) failed; the request may succeed later or elsewhere. */
export class UpstreamError extends DomainError {
  readonly code = 'UPSTREAM_UNAVAILABLE';
}

/** No valid credentials (missing, wrong or expired). */
export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
}

/** Valid credentials, but not allowed to do this (not a member, role too low). */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}

/** Too many attempts; the caller may try again after `retryAfterSeconds`. */
export class TooManyRequestsError extends DomainError {
  readonly code = 'TOO_MANY_REQUESTS';
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  constructor(readonly issues: ValidationIssue[]) {
    // The message names the problems, so callers that only show `message` are still precise.
    super(
      issues.length === 1
        ? issues[0].message
        : `Validation failed with ${issues.length} errors: ${issues.slice(0, 3).map((i) => i.message).join('; ')}${issues.length > 3 ? '; …' : ''}`,
    );
  }
}

/** Thrown by node executions when a later attempt may succeed (network, 5xx, courier down). */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

/** Thrown by node executions when retrying cannot help (bad config, business rule). */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}
