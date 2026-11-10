import { NotFoundError } from './errors';

/** Returns the value, or throws NotFoundError — the "find or 404" step every service repeats. */
export function requireFound<T>(value: T | null | undefined, entity: string, id: string): T {
  if (value === null || value === undefined) throw new NotFoundError(entity, id);
  return value;
}
