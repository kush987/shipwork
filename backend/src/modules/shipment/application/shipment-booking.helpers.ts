import { InvalidOperationError, UpstreamError } from '../../../shared/domain/errors';
import { CircuitOpenError } from '../../courier/domain/circuit-breaker';
import { CourierRejectedError, CourierUnavailableError } from '../../courier/domain/courier-provider';

/** Courier failures in business terms: refused → 409, unavailable / circuit open → 503. */
export function toBookingError(error: unknown, courierName: string): Error {
  if (error instanceof CircuitOpenError) return new UpstreamError(`${courierName} is temporarily unavailable (circuit open) — try another courier`);
  if (error instanceof CourierRejectedError) return new InvalidOperationError(`${courierName} rejected the booking: ${error.message}`);
  if (error instanceof CourierUnavailableError) return new UpstreamError(`${error.message} — please try again`);
  return error as Error;
}
