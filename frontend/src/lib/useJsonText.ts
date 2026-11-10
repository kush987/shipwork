import { useCallback, useMemo, useState } from 'react';
import { parseJsonText, toJsonText } from './json';
import type { JsonParseOptions, JsonText } from './json.types';

/** State for a JSON textarea that validates as you type. */
export function useJsonText(initial: unknown = undefined, opts: JsonParseOptions = {}): JsonText {
  const { expect, allowEmpty } = opts;
  const [text, setText] = useState(() => (typeof initial === 'string' ? initial : toJsonText(initial)));
  const parsed = useMemo(() => parseJsonText(text, { expect, allowEmpty }), [text, expect, allowEmpty]);
  const reset = useCallback((next: unknown) => setText(typeof next === 'string' ? next : toJsonText(next)), []);
  return { text, setText, value: parsed.value, error: parsed.error, valid: !parsed.error, reset };
}
