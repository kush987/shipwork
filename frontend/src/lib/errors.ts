import { ApiError } from '../api/http';

/** Messages of a failed save: every validation error the API returned, or the error message. */
export function errorMessages(error: unknown): string[] {
  if (!error) return [];
  if (error instanceof ApiError && error.errors?.length) return error.errors.map((e) => e.message);
  return [error instanceof Error ? error.message : 'Something went wrong'];
}

/** The signed-in member's role doesn't allow the request (403). */
export const isForbidden = (error: unknown) => error instanceof ApiError && error.status === 403;

/** react-query `retry`: once, but never for a 403 (asking again won't change the role). */
export const retryUnlessForbidden = (failures: number, error: unknown) => !isForbidden(error) && failures < 1;
