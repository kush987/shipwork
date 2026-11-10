import { validateFields, fieldSpecIssues } from '../../../shared/schema/field-schema';
import { isPlainObject } from '../../../shared/util/json-setting';
import { normalizePath, pathIssues } from './path-pattern';
import { AUTHORIZER_CACHE_SECONDS, ENDPOINT_AUTH, HTTP_METHODS, RATE_LIMIT_PER_MINUTE, TIMEOUT_MS } from './api-endpoint.constants';
import { ApiEndpoint, EndpointInput, HttpMethod } from './api-endpoint.types';
import type { ValidationIssue } from '../../../shared/domain/errors.types';
import { FieldIssue } from '../../../shared/schema/field-schema.types';

/** Methods whose input is the JSON body; the others are validated against the query string. */
export const hasBody = (method: HttpMethod) => method === 'POST' || method === 'PUT' || method === 'PATCH';

export function endpointIssues(input: EndpointInput): ValidationIssue[] {
  const issues: string[] = [];
  if (!input.name?.trim()) issues.push('Name is required');
  if (!HTTP_METHODS.includes(input.method)) issues.push(`Method must be one of ${HTTP_METHODS.join(', ')}`);
  issues.push(...pathIssues(normalizePath(input.path ?? '')));
  issues.push(...fieldSpecIssues(input.requestSchema ?? []));
  const timeout = input.timeoutMs ?? TIMEOUT_MS.default;
  if (!Number.isInteger(timeout) || timeout < TIMEOUT_MS.min || timeout > TIMEOUT_MS.max) {
    issues.push(`Timeout must be between ${TIMEOUT_MS.min} and ${TIMEOUT_MS.max} ms`);
  }
  if (input.auth !== undefined && !ENDPOINT_AUTH.includes(input.auth)) issues.push(`Auth must be one of ${ENDPOINT_AUTH.join(', ')}`);
  if (input.auth === 'jwt' && !input.authProviderId) issues.push('Choose the sign-in provider whose tokens callers send');
  const cache = input.authorizerCacheSeconds ?? AUTHORIZER_CACHE_SECONDS.default;
  if (!Number.isInteger(cache) || cache < AUTHORIZER_CACHE_SECONDS.min || cache > AUTHORIZER_CACHE_SECONDS.max) {
    issues.push(`Authorizer cache must be ${AUTHORIZER_CACHE_SECONDS.min}–${AUTHORIZER_CACHE_SECONDS.max} seconds`);
  }
  if (input.authorizerWorkflowId && input.authorizerWorkflowId === input.workflowId) issues.push('The authorizer must be a different workflow than the endpoint’s own');
  const limit = input.rateLimitPerMinute;
  if (limit !== undefined && limit !== null && (!Number.isInteger(limit) || limit < RATE_LIMIT_PER_MINUTE.min || limit > RATE_LIMIT_PER_MINUTE.max)) {
    issues.push(`Rate limit must be a whole number of calls per minute between ${RATE_LIMIT_PER_MINUTE.min} and ${RATE_LIMIT_PER_MINUTE.max.toLocaleString('en')}`);
  }
  return issues.map((message) => ({ message }));
}

/**
 * Validates a call's input against the endpoint's request schema: the JSON body for POST/PUT/PATCH,
 * the query string (coerced from text) for GET/DELETE. Returns the input to hand to the workflow.
 */
export function validateRequestInput(
  endpoint: Pick<ApiEndpoint, 'method' | 'requestSchema'>,
  input: { body: unknown; query: Record<string, unknown> },
): { body: unknown; query: Record<string, unknown>; issues: FieldIssue[] } {
  if (!endpoint.requestSchema.length) return { ...input, issues: [] };
  if (hasBody(endpoint.method)) {
    if (!isPlainObject(input.body)) return { ...input, issues: [{ field: 'body', message: 'Body must be a JSON object' }] };
    const { value, issues } = validateFields(endpoint.requestSchema, input.body);
    return { body: value, query: input.query, issues };
  }
  const { value, issues } = validateFields(endpoint.requestSchema, input.query, { fromText: true });
  return { body: input.body, query: value, issues };
}
