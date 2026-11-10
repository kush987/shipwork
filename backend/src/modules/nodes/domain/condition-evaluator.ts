import { isPlainObject } from '../../../shared/util/json-setting';
import { ConditionOperator } from './condition-evaluator.types';
import { ISO_DATE, RELATIVE_TIME, UNIT_MS } from './condition-evaluator.constants';

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

/** A point in time: a timestamp in ms, an ISO date, `now` or `now-7d` style (relative to `now`). */
export function toTime(v: unknown, now: number): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  if (typeof v !== 'string') return null;
  const text = v.trim();
  const relative = RELATIVE_TIME.exec(text);
  if (relative) return relative[1] ? now + (relative[1] === '-' ? -1 : 1) * Number(relative[2]) * UNIT_MS[relative[3].toLowerCase()] : now;
  if (!ISO_DATE.test(text)) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : time;
}

const lower = (v: unknown) => String(v ?? '').toLowerCase();

/** "a, b, c" → its parts (a list rendered from a placeholder arrives this way too). */
const parts = (expected: unknown) =>
  String(expected ?? '')
    .split(',')
    .map((s) => s.trim());

const loosEquals = (actual: unknown, expected: unknown): boolean => {
  const a = toNumber(actual);
  const b = toNumber(expected);
  if (a !== null && b !== null) return a === b;
  if (typeof actual === 'boolean') return String(actual) === String(expected).toLowerCase();
  return lower(actual) === lower(expected);
};

const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0) ||
  (isPlainObject(v) && Object.keys(v).length === 0);

/** Text tests on a list hold when any item passes (`shipment.items.*.sku starts with KUR`). */
const anyText = (actual: unknown, test: (text: string) => boolean) => (Array.isArray(actual) ? actual : [actual]).some((v) => test(lower(v)));

/** Numbers compare as numbers; otherwise both sides must be points in time (dates, now-7d). */
function inRange(actual: unknown, low: unknown, high: unknown, now: number): boolean {
  const [a, x, y] = [toNumber(actual), toNumber(low), toNumber(high)];
  if (a !== null && x !== null && y !== null) return a >= Math.min(x, y) && a <= Math.max(x, y);
  const [t, tx, ty] = [toTime(actual, now), toTime(low, now), toTime(high, now)];
  return t !== null && tx !== null && ty !== null && t >= Math.min(tx, ty) && t <= Math.max(tx, ty);
}

/**
 * Pure, side-effect free comparison used by logic.condition. Text compares case-insensitively; `now`
 * is passed in so relative dates (now-7d) are testable.
 */
export function evaluateCondition(actual: unknown, operator: ConditionOperator, expected: unknown, now = Date.now()): boolean {
  switch (operator) {
    case 'eq':
      return loosEquals(actual, expected);
    case 'neq':
      return !loosEquals(actual, expected);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = toNumber(actual);
      const b = toNumber(expected);
      if (a === null || b === null) return false;
      return operator === 'gt' ? a > b : operator === 'gte' ? a >= b : operator === 'lt' ? a < b : a <= b;
    }
    case 'between': {
      const [low, high] = parts(expected);
      return high !== undefined && inRange(actual, low, high, now);
    }
    case 'contains':
      if (Array.isArray(actual)) return actual.some((item) => loosEquals(item, expected));
      return lower(actual).includes(lower(expected));
    case 'not_contains':
      return !evaluateCondition(actual, 'contains', expected, now);
    case 'starts_with':
      return anyText(actual, (text) => text.startsWith(lower(expected)));
    case 'ends_with':
      return anyText(actual, (text) => text.endsWith(lower(expected)));
    case 'in':
      return parts(expected).some((candidate) => loosEquals(actual, candidate));
    case 'not_in':
      return !parts(expected).some((candidate) => loosEquals(actual, candidate));
    case 'before':
    case 'after': {
      const [a, b] = [toTime(actual, now), toTime(expected, now)];
      if (a === null || b === null) return false;
      return operator === 'before' ? a < b : a > b;
    }
    case 'is_empty':
      return isEmpty(actual);
    case 'is_not_empty':
      return !isEmpty(actual);
    case 'is_true':
      return actual === true || lower(actual) === 'true';
    case 'is_false':
      return actual === false || lower(actual) === 'false';
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '';
    case 'not_exists':
      return actual === undefined || actual === null || actual === '';
  }
}
