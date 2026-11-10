import { isPlainObject } from '../util/json-setting';
import { ValidateOptions, FieldType, FieldIssue, FieldSpec } from './field-schema.types';
import { DATE_TEXT, FIELD_TYPES, FIELD_KEY, UNIQUE_FIELD_TYPES } from './field-schema.constants';

export function matchesType(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'date':
      return toIsoDate(value) !== null;
  }
}

/**
 * A date value as one canonical ISO text (`2026-11-09` → `2026-11-09T00:00:00.000Z`), or null when
 * it isn't a date. Dates are stored as real dates in the database and read back in this form.
 */
export function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== 'string' || !DATE_TEXT.test(value.trim())) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Query-string values are always text; turn them into the declared type when unambiguous. */
export function coerceText(value: unknown, type: FieldType): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  switch (type) {
    case 'number':
      return text !== '' && !Number.isNaN(Number(text)) ? Number(text) : value;
    case 'boolean':
      return text === 'true' ? true : text === 'false' ? false : value;
    case 'object':
    case 'array':
      try {
        return JSON.parse(text);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

/**
 * Checks `input` against `specs`. Fields not in the schema pass through untouched. Returns the
 * (possibly coerced) value and every problem found, so callers can report them all at once.
 */
export function validateFields(
  specs: FieldSpec[],
  input: Record<string, unknown>,
  options: ValidateOptions = {},
): { value: Record<string, unknown>; issues: FieldIssue[] } {
  const value = { ...input };
  const issues: FieldIssue[] = [];
  for (const spec of specs) {
    let v = value[spec.key];
    const missing = v === undefined || v === null || v === '';
    if (missing) {
      if (spec.required && !options.partial) issues.push({ field: spec.key, message: `${spec.key} is required` });
      continue;
    }
    if (options.fromText) v = value[spec.key] = coerceText(v, spec.type);
    if (!matchesType(v, spec.type)) {
      issues.push({ field: spec.key, message: spec.type === 'date' ? `${spec.key} must be a date like 2026-11-09 or 2026-11-09T10:30:00Z` : `${spec.key} must be ${article(spec.type)} ${spec.type}` });
    } else if (spec.type === 'date') {
      value[spec.key] = toIsoDate(v);
    }
  }
  return { value, issues };
}

/** Problems with the schema itself (as authored by a user). */
export function fieldSpecIssues(specs: unknown): string[] {
  if (!Array.isArray(specs)) return ['Fields must be a list'];
  const issues: string[] = [];
  const seen = new Set<string>();
  specs.forEach((spec, i) => {
    const s = spec as Partial<FieldSpec>;
    if (!s || typeof s.key !== 'string' || !FIELD_KEY.test(s.key)) {
      issues.push(`Field ${i + 1}: name must start with a letter or _ and use letters, digits or _`);
      return;
    }
    if (seen.has(s.key)) issues.push(`Field "${s.key}" is listed twice`);
    seen.add(s.key);
    if (!FIELD_TYPES.includes(s.type as FieldType)) issues.push(`Field "${s.key}": type must be one of ${FIELD_TYPES.join(', ')}`);
    else if (s.unique && !UNIQUE_FIELD_TYPES.includes(s.type!)) issues.push(`Field "${s.key}": only text, number and date fields can be unique`);
  });
  return issues;
}

/** Canonical field specs. `unique` is kept only where it means something (collections). */
export const normalizeFieldSpecs = (specs: FieldSpec[] = [], { allowUnique = false } = {}): FieldSpec[] =>
  specs.map(({ key, type, required, description, unique }) => ({
    key: key.trim(),
    type,
    required: !!required,
    ...(description?.trim() ? { description: description.trim() } : {}),
    ...(allowUnique && unique ? { unique: true } : {}),
  }));

const article = (type: string) => (/^[aeiou]/.test(type) ? 'an' : 'a');
