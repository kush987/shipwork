import { SOLE_PLACEHOLDER } from './path.constants';

/**
 * Reads `a.b.0.c` style paths from plain objects. Returns undefined for missing segments.
 * A `*` segment maps over an array: `shipment.items.*.sku` → every item's SKU.
 */
export function getPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  return walk(source, path.split('.'));
}

function walk(value: unknown, keys: string[]): unknown {
  if (!keys.length) return value;
  if (value === null || value === undefined) return undefined;
  const [key, ...rest] = keys;
  if (key === '*') {
    return Array.isArray(value) ? value.map((item) => walk(item, rest)).filter((v) => v !== undefined) : undefined;
  }
  return walk((value as Record<string, unknown>)[key], rest);
}

/** Replaces `{{ path }}` placeholders with values from `data`. Objects are JSON-encoded. */
export function renderTemplate(template: string, data: unknown): string {
  return template.replace(/\{\{\s*([\w.*]+)\s*\}\}/g, (_, path: string) => {
    const value = getPath(data, path);
    if (value === undefined || value === null) return '';
    if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) return value.join(', ');
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

/** Recursively renders templates inside every string of a JSON-like value. Every result is text. */
export function renderDeep<T>(value: T, data: unknown): T {
  return mapStrings(value, (s) => renderTemplate(s, data)) as T;
}

/**
 * Like renderDeep, but a string that is exactly one placeholder keeps the value's type:
 * `"{{request.body.quantity}}"` → `2` and `"{{context.order}}"` → the object. Placeholders inside
 * longer text still render as text. Used where values are stored or returned as data (records,
 * API responses, context values) rather than sent as text.
 */
export function renderTyped(value: unknown, data: unknown): unknown {
  return mapStrings(value, (s) => {
    const sole = SOLE_PLACEHOLDER.exec(s.trim());
    return sole ? (getPath(data, sole[1]) ?? null) : renderTemplate(s, data);
  });
}

function mapStrings(value: unknown, render: (s: string) => unknown): unknown {
  if (typeof value === 'string') return render(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, render));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, render)]));
  }
  return value;
}
