import { isPlainObject } from 'lodash-es';
import type { JsonParseOptions, JsonParseResult } from './json.types';

/**
 * Parses user-typed JSON. Empty text is `undefined` when allowed, an error otherwise.
 * `expect: 'object'` also rejects arrays, null and primitives.
 */
export function parseJsonText(text: string, opts: JsonParseOptions = {}): JsonParseResult {
  const { expect = 'any', allowEmpty = true } = opts;
  if (!text.trim()) return allowEmpty ? { value: undefined } : { error: 'Required' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { error: `Invalid JSON${e instanceof Error ? ` — ${e.message.replace(/^JSON\.parse: /, '')}` : ''}` };
  }
  if (expect === 'object' && !isPlainObject(value)) return { error: 'Must be a JSON object, e.g. { "key": "value" }' };
  return { value };
}

/** Text shown in a JSON editor for a value: '' for nothing, pretty JSON otherwise. */
export const toJsonText = (v: unknown): string => (v === undefined ? '' : JSON.stringify(v, null, 2));
