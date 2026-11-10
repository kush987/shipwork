import { ValidationFailedError } from '../../../shared/domain/errors';
import type { ValidationIssue } from '../../../shared/domain/errors.types';
import type { EventDefinition, EventDefinitionInput } from '../domain/event-definition.types';

/** Problems with an event definition as authored (name, payload field keys and labels). */
export function eventDefinitionIssues(input: EventDefinitionInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.label.trim().length < 2) issues.push({ message: 'Name must be at least 2 characters' });
  const keys = new Set<string>();
  for (const f of input.payloadSchema) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/.test(f.key)) issues.push({ message: `Field key "${f.key}" must be a letter followed by letters, digits or _` });
    if (keys.has(f.key)) issues.push({ message: `Field key "${f.key}" is used twice` });
    keys.add(f.key);
    if (!f.label?.trim()) issues.push({ message: `Field "${f.key}" needs a label` });
  }
  if (input.payloadSchema.length > 20) issues.push({ message: 'An event can have at most 20 payload fields' });
  return issues;
}

/** Checks a payload against the event's fields and coerces values to their kinds; throws on problems. */
export function coercePayload(def: EventDefinition, payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  const issues: ValidationIssue[] = [];
  for (const field of def.payloadSchema) {
    const raw = payload[field.key];
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) issues.push({ message: `"${field.label}" (${field.key}) is required` });
      delete out[field.key];
      continue;
    }
    if (field.kind === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) issues.push({ message: `"${field.label}" must be a number` });
      else out[field.key] = n;
    } else if (field.kind === 'boolean') {
      if (typeof raw === 'boolean') out[field.key] = raw;
      else if (raw === 'true' || raw === 'false') out[field.key] = raw === 'true';
      else issues.push({ message: `"${field.label}" must be true or false` });
    } else {
      out[field.key] = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
  }
  if (issues.length) throw new ValidationFailedError(issues);
  return out;
}
