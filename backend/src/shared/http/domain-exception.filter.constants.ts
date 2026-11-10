import { DomainErrorClass } from './domain-exception.filter.types';
import {
  ValidationFailedError,
  UpstreamError,
  InvalidOperationError,
  NotFoundError,
  UnauthenticatedError,
  ForbiddenError,
  TooManyRequestsError,
} from '../domain/errors';
import { HttpStatus } from '@nestjs/common';

/**
 * Domain errors stay HTTP-agnostic; this table is the single place that maps them to status codes.
 * Adding an error type means adding a row, not another branch (Open/Closed).
 */
export const STATUS_BY_ERROR: [DomainErrorClass, HttpStatus][] = [
  [NotFoundError, HttpStatus.NOT_FOUND],
  [UnauthenticatedError, HttpStatus.UNAUTHORIZED],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  [TooManyRequestsError, HttpStatus.TOO_MANY_REQUESTS],
  [ValidationFailedError, HttpStatus.UNPROCESSABLE_ENTITY],
  [UpstreamError, HttpStatus.SERVICE_UNAVAILABLE],
  [InvalidOperationError, HttpStatus.CONFLICT],
];
