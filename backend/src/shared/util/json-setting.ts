import { isPlainObject as isLodashPlainObject } from 'lodash';
import { NonRetryableError } from '../domain/errors';
import { JsonSettingSpec } from './json-setting.types';

/** A JSON-style object (not an array, class instance or null), via lodash. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => isLodashPlainObject(value);

/**
 * Node settings edited as JSON arrive either already parsed (from the builder) or as text (from
 * templates and defaults). Returns undefined for blank values; bad JSON fails without retry.
 */
export function parseJsonValue(value: unknown, label: string): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new NonRetryableError(`${label} is not valid JSON`);
  }
}

/** Like parseJsonValue, but the setting must be a JSON object. */
export function parseJsonObject(value: unknown, label: string): Record<string, unknown> | undefined {
  const parsed = parseJsonValue(value, label);
  if (parsed === undefined) return undefined;
  if (!isPlainObject(parsed)) throw new NonRetryableError(`${label} must be a JSON object`);
  return parsed;
}

/** Collects parse problems of several JSON settings as messages, for `validateConfig`. */
export function jsonSettingErrors(config: Record<string, unknown>, specs: JsonSettingSpec[]): string[] {
  const errors: string[] = [];
  for (const { key, label, shape = 'object' } of specs) {
    try {
      if (shape === 'object') parseJsonObject(config[key], label);
      else parseJsonValue(config[key], label);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return errors;
}
