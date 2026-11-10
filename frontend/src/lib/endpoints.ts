import { pick } from 'lodash-es';
import type { ApiEndpoint, EndpointUpdateInput, RequestField } from '../api/types';
import { BODY_METHODS, PATH_SEGMENT_RE, SAMPLE_VALUE_BY_TYPE } from './endpoints.constants';

/** POST / PUT / PATCH carry a JSON body; GET / DELETE are validated against the query string. */
export const methodHasBody = (m: string) => BODY_METHODS.includes(m.toUpperCase());

/** Why a path isn't valid ('/orders', '/orders/:id'), or undefined. */
export function pathProblem(path: string): string | undefined {
  if (!path) return 'Required';
  if (!path.startsWith('/')) return 'Start the path with /';
  const segments = path.split('/').slice(1);
  if (segments.some((s) => !PATH_SEGMENT_RE.test(s))) {
    return 'Use lowercase letters, digits, - and _ — and :name for parameters, e.g. /orders/:id';
  }
  return undefined;
}

/** Adds the leading slash people tend to forget. */
export const normalizePath = (input: string) => {
  const p = input.trim();
  return p && !p.startsWith('/') ? `/${p}` : p;
};

/** ':id' segments of a path → ['id']. */
export const pathParams = (path: string): string[] =>
  path
    .split('/')
    .filter((s) => s.startsWith(':') && s.length > 1)
    .map((s) => s.slice(1));

/** '/orders/:id' + { id: '42' } → '/orders/42'. Missing values keep the ':id' placeholder. */
export function resolvePath(path: string, params: Record<string, string>): string {
  return path
    .split('/')
    .map((s) => {
      if (!s.startsWith(':')) return s;
      const v = params[s.slice(1)];
      return v ? encodeURIComponent(v) : s;
    })
    .join('/');
}

/** A starter body / query object with one entry per schema field. */
export const sampleFromSchema = (fields: RequestField[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((f) => [f.key, SAMPLE_VALUE_BY_TYPE[f.type]]));

/** Absolute URL of an endpoint on the runtime gateway, as the browser sees it. */
export const endpointUrl = (ep: Pick<ApiEndpoint, 'url'>) => `${window.location.origin}${ep.url}`;

/** Everything PUT /endpoints/:id accepts, taken from a loaded endpoint. */
export function toEndpointInput(ep: ApiEndpoint): EndpointUpdateInput {
  return {
    ...pick(ep, ['name', 'description', 'method', 'path', 'workflowId', 'mode', 'auth']),
    requestSchema: ep.requestSchema.map((f) => ({ ...f })),
    ...pick(ep, ['timeoutMs', 'enabled']),
    rateLimitPerMinute: ep.rateLimitPerMinute ?? null,
    authProviderId: ep.authProviderId ?? null,
    authorizerWorkflowId: ep.authorizerWorkflowId ?? null,
    authorizerCacheSeconds: ep.authorizerCacheSeconds ?? 0,
  };
}
