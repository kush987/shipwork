/**
 * A small, user-editable schema: a flat list of typed fields. Shared by endpoint request schemas
 * and data collections so both validate (and explain errors) the same way.
 */
export const FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array', 'date'] as const;

/** Types a unique field can have (values the database compares exactly). */
export const UNIQUE_FIELD_TYPES: readonly string[] = ['string', 'number', 'date'];

export const FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** A date as text: 2026-11-09, or a full ISO date-time such as 2026-11-09T10:30:00Z / …+05:30. */
export const DATE_TEXT = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
