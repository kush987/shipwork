import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, TooManyRequestsError, ValidationFailedError } from '../domain/errors';
import { STATUS_BY_ERROR } from './domain-exception.filter.constants';

export const httpStatusOf = (error: DomainError): HttpStatus =>
  STATUS_BY_ERROR.find(([type]) => error instanceof type)?.[1] ?? HttpStatus.BAD_REQUEST;

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const statusCode = httpStatusOf(error);
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof TooManyRequestsError) res.setHeader('retry-after', String(error.retryAfterSeconds));
    res.status(statusCode).json({
      statusCode,
      message: error.message,
      ...(error instanceof ValidationFailedError ? { errors: error.issues } : {}),
      ...(error instanceof TooManyRequestsError ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    });
  }
}
