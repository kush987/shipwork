import type { FieldType, HttpMethod } from '../api/types';

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Methods whose input is a JSON body; the others are validated against the query string. */
export const BODY_METHODS = ['POST', 'PUT', 'PATCH'];

/** Trigger key of workflows that endpoints (and authorizers) can run. */
export const HTTP_TRIGGER_EVENT = 'http.request';

export const TIMEOUT_MIN = 1000;
export const TIMEOUT_MAX = 30000;
export const TIMEOUT_DEFAULT = 10000;

/** Bounds of an endpoint's own rate limit (calls per minute per caller). */
export const RATE_LIMIT_MIN = 1;
export const RATE_LIMIT_MAX = 100_000;

/** One path segment: a literal ('orders') or a parameter (':id'). */
export const PATH_SEGMENT_RE = /^(?:[a-z0-9_-]+|:[A-Za-z_][A-Za-z0-9_]*)$/;

/** Starter value per schema field type, for sample bodies and queries. */
export const SAMPLE_VALUE_BY_TYPE: Record<FieldType, unknown> = { string: '', number: 0, boolean: false, object: {}, array: [], date: '2026-01-01' };
