import { PARAM_SEGMENT, STATIC_SEGMENT, MAX_SEGMENTS } from './path-pattern.constants';

export const segmentsOf = (path: string) => path.split('/').filter(Boolean);

const isParam = (segment: string) => segment.startsWith(':');

/** `orders/:id/` → `/orders/:id` (leading slash, no trailing or doubled slashes, static parts lowercase). */
export function normalizePath(path: string): string {
  return '/' + segmentsOf(path.trim()).map((s) => (isParam(s) ? s : s.toLowerCase())).join('/');
}

export function pathIssues(path: string): string[] {
  const segments = segmentsOf(path);
  if (segments.length > MAX_SEGMENTS) return [`Paths can have at most ${MAX_SEGMENTS} segments`];
  const issues: string[] = [];
  const params = new Set<string>();
  for (const segment of segments) {
    if (isParam(segment)) {
      if (!PARAM_SEGMENT.test(segment)) issues.push(`Path parameter “${segment}” must be : followed by a name (letters, digits, _)`);
      else if (params.has(segment)) issues.push(`Path parameter “${segment}” is used twice`);
      params.add(segment);
    } else if (!STATIC_SEGMENT.test(segment)) {
      issues.push(`Path segment “${segment}” may only use lowercase letters, digits, - _ and .`);
    }
  }
  return issues;
}

export const pathParams = (path: string) => segmentsOf(path).filter(isParam).map((s) => s.slice(1));

/** Two paths with the same shape (`/orders/:id` and `/orders/:orderId`) would match the same URLs. */
export const pathShape = (path: string) => '/' + segmentsOf(path).map((s) => (isParam(s) ? ':' : s)).join('/');

/** OpenAPI writes parameters as `{id}`. */
export const toOpenApiPath = (path: string) => '/' + segmentsOf(path).map((s) => (isParam(s) ? `{${s.slice(1)}}` : s)).join('/');

/** Matches a concrete URL path against a pattern; returns the decoded parameters or null. */
export function matchPath(pattern: string, actual: string): Record<string, string> | null {
  const expected = segmentsOf(pattern);
  const given = segmentsOf(actual);
  if (expected.length !== given.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i++) {
    let value: string;
    try {
      value = decodeURIComponent(given[i]);
    } catch {
      return null;
    }
    if (isParam(expected[i])) params[expected[i].slice(1)] = value;
    else if (expected[i] !== value.toLowerCase()) return null;
  }
  return params;
}

/** Higher = more specific: `/orders/summary` must win over `/orders/:id` for `/orders/summary`. */
export const specificity = (pattern: string) =>
  segmentsOf(pattern).reduce((score, segment, i) => score + (isParam(segment) ? 0 : 2 ** (MAX_SEGMENTS - i)), 0);
