export type JsonExpect = 'any' | 'object';

export interface JsonParseOptions {
  expect?: JsonExpect;
  /** Empty text parses to `undefined` (default) instead of failing as "Required". */
  allowEmpty?: boolean;
}

export interface JsonParseResult {
  value?: unknown;
  error?: string;
}

/** State of a JSON textarea that validates as you type (see useJsonText). */
export interface JsonText {
  text: string;
  setText: (text: string) => void;
  /** Parsed value (undefined when empty or invalid). */
  value: unknown;
  error?: string;
  valid: boolean;
  /** Replace the text with a value (or raw text). */
  reset: (next: unknown) => void;
}
