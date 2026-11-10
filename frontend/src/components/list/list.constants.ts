import type { FieldKind, OperatorSpec } from './list.types';

/** The operators the condition builder offers per kind of column; the first is the default. */
export const OPERATORS: Record<FieldKind, OperatorSpec[]> = {
  text: [
    { op: 'contains', label: 'contains', needsValue: true },
    { op: 'not_contains', label: 'does not contain', needsValue: true },
    { op: 'is', label: 'is', needsValue: true },
    { op: 'is_not', label: 'is not', needsValue: true },
    { op: 'starts_with', label: 'starts with', needsValue: true },
    { op: 'empty', label: 'is empty', needsValue: false },
    { op: 'not_empty', label: 'is not empty', needsValue: false },
  ],
  enum: [
    { op: 'is', label: 'is', needsValue: true },
    { op: 'is_not', label: 'is not', needsValue: true },
  ],
  number: [
    { op: 'eq', label: '=', needsValue: true },
    { op: 'neq', label: '≠', needsValue: true },
    { op: 'gt', label: '>', needsValue: true },
    { op: 'gte', label: '≥', needsValue: true },
    { op: 'lt', label: '<', needsValue: true },
    { op: 'lte', label: '≤', needsValue: true },
    { op: 'empty', label: 'is empty', needsValue: false },
  ],
  date: [
    { op: 'within_days', label: 'in the last … days', needsValue: true },
    { op: 'after', label: 'is after', needsValue: true },
    { op: 'before', label: 'is before', needsValue: true },
    { op: 'empty', label: 'is empty / never', needsValue: false },
    { op: 'not_empty', label: 'is set', needsValue: false },
  ],
};

/** URL parameter names (after the list's prefix). */
export const PARAM = {
  search: 'q',
  sort: 'sort',
  quick: 'f.',
  conditions: 'where',
  match: 'match',
} as const;

/** Header clicks start newest / largest first for dates and numbers, A–Z otherwise. */
export const FIRST_DIR = { text: 'asc', enum: 'asc', number: 'desc', date: 'desc' } as const;

/** How each kind names its two directions in the phone sort menu. */
export const DIR_WORDS: Record<FieldKind, { asc: string; desc: string }> = {
  text: { asc: 'A–Z', desc: 'Z–A' },
  enum: { asc: 'A–Z', desc: 'Z–A' },
  number: { asc: 'low–high', desc: 'high–low' },
  date: { asc: 'oldest first', desc: 'newest first' },
};

export const DAY_MS = 86_400_000;
