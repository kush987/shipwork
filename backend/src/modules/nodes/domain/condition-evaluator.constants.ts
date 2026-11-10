/** Every operator a condition can use, in the order the builder lists them. */
export const CONDITION_OPERATORS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater than or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less than or equal' },
  { value: 'between', label: 'is between (min, max)' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'in', label: 'is one of (comma separated)' },
  { value: 'not_in', label: 'is not one of (comma separated)' },
  { value: 'before', label: 'is before (date)' },
  { value: 'after', label: 'is after (date)' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'is_true', label: 'is true' },
  { value: 'is_false', label: 'is false' },
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: 'does not exist' },
] as const;

/** Operators that look only at the field, so they take no value. */
export const VALUELESS_OPERATORS: readonly string[] = ['exists', 'not_exists', 'is_empty', 'is_not_empty', 'is_true', 'is_false'];

/** `now`, or `now` plus/minus an amount: now-7d, now+2h (s, m, h, d, w). */
export const RELATIVE_TIME = /^now\s*(?:([+-])\s*(\d+)\s*([smhdw]))?$/i;

export const UNIT_MS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** Text read as a date: ISO 8601, at least yyyy-mm-dd (so "1" or "May" never parse as one). */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
