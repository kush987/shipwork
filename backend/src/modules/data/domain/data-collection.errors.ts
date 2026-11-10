import { InvalidOperationError } from '../../../shared/domain/errors';

const shown = (value: unknown) => (typeof value === 'string' ? `“${value}”` : JSON.stringify(value));

/** A write would give a unique field a value another record already has (409). */
export class DuplicateValueError extends InvalidOperationError {
  constructor(
    readonly collection: string,
    readonly field: string,
    readonly value: unknown,
  ) {
    super(value === undefined ? `A record in “${collection}” already has this ${field}` : `A record in “${collection}” already has ${field} ${shown(value)}`);
  }
}

/** A unique index can't be built while records already share a value (409). */
export class UniqueConflictError extends InvalidOperationError {
  constructor(collection: string, field: string, value: unknown, count: number) {
    super(`Can't make “${field}” unique: ${count} records in “${collection}” have ${field} ${shown(value)} — change or delete them first`);
  }
}
