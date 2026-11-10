import { ValidationFailedError } from '../domain/errors';

/** Query parameters arrive as text; JSON ones are parsed here so bad input is a 422, not a 500. */
export function parseJsonQueryParam(value: string | undefined, label: string): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new ValidationFailedError([{ message: `${label} is not valid JSON` }]);
  }
}
