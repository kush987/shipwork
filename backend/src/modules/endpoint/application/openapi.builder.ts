import { hasBody } from '../domain/api-endpoint';
import { toOpenApiPath, pathParams } from '../domain/path-pattern';
import { Schema } from './openapi.builder.types';
import { ERROR_SCHEMA_REF, RETRY_AFTER_HEADER } from './openapi.builder.constants';
import { ApiEndpoint } from '../domain/api-endpoint.types';
import type { FieldSpec } from '../../../shared/schema/field-schema.types';
import { camelCase } from 'lodash';

const errorResponse = (description: string) => ({ description, content: { 'application/json': { schema: ERROR_SCHEMA_REF } } });

/** The endpoint's description, plus its own rate limit when it has one. */
const describe = (endpoint: ApiEndpoint) =>
  [endpoint.description, endpoint.rateLimitPerMinute ? `Rate limit: ${endpoint.rateLimitPerMinute} calls per minute per caller.` : '']
    .filter(Boolean)
    .join('\n\n');

const fieldSchema = (field: FieldSpec): Schema => ({ type: field.type, ...(field.description ? { description: field.description } : {}) });

const objectSchema = (fields: FieldSpec[]): Schema => ({
  type: 'object',
  properties: Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f)])),
  ...(fields.some((f) => f.required) ? { required: fields.filter((f) => f.required).map((f) => f.key) } : {}),
  additionalProperties: true,
});

/** `Create order` → `createOrder`, made unique across the document. */
function operationIds(endpoints: ApiEndpoint[]): Map<string, string> {
  const used = new Map<string, number>();
  return new Map(
    endpoints.map((e) => {
      const base = camelCase(e.name) || `${e.method.toLowerCase()}Endpoint`;
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      return [e.id, n === 1 ? base : `${base}${n}`];
    }),
  );
}

function operation(endpoint: ApiEndpoint, operationId: string): Schema {
  const parameters = [
    ...pathParams(endpoint.path).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
    ...(hasBody(endpoint.method) ? [] : endpoint.requestSchema.map((f) => ({ name: f.key, in: 'query', required: f.required, schema: fieldSchema(f) }))),
  ];
  const success =
    endpoint.mode === 'async'
      ? {
          '202': {
            description: 'Accepted — the workflow runs in the background',
            content: { 'application/json': { schema: { type: 'object', properties: { executionId: { type: 'string' }, status: { type: 'string' } } } } },
          },
        }
      : { '200': { description: 'The response returned by the workflow (its status code may differ)', content: { 'application/json': { schema: {} } } } };
  return {
    operationId,
    summary: endpoint.name,
    ...(describe(endpoint) ? { description: describe(endpoint) } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(hasBody(endpoint.method)
      ? { requestBody: { required: endpoint.requestSchema.some((f) => f.required), content: { 'application/json': { schema: objectSchema(endpoint.requestSchema) } } } }
      : {}),
    responses: {
      ...success,
      ...(endpoint.auth === 'api_key' ? { '401': errorResponse('Missing or invalid API key') } : {}),
      ...(endpoint.auth === 'jwt' ? { '401': errorResponse('Missing, invalid or expired sign-in token') } : {}),
      ...(endpoint.auth === 'api_key' || endpoint.authorizerWorkflowId ? { '403': errorResponse('Not allowed (API key scope, or the authorizer denied the call)') } : {}),
      ...(endpoint.requestSchema.length ? { '422': errorResponse('The request does not match the schema') } : {}),
      '429': { ...errorResponse('Too many calls (rate limit or concurrent-call cap) — wait for Retry-After seconds'), headers: RETRY_AFTER_HEADER },
      '500': errorResponse('The workflow failed'),
      ...(endpoint.mode === 'sync' ? { '504': errorResponse('The workflow took longer than the timeout') } : {}),
    },
    security: endpoint.auth === 'api_key' ? [{ apiKey: [] }] : endpoint.auth === 'jwt' ? [{ bearerAuth: [] }] : [],
  };
}

/** OpenAPI 3.0 description of a tenant's endpoints — import it into Postman or generate a client SDK. */
export function buildOpenApi({ title, serverUrl, endpoints }: { title: string; serverUrl: string; endpoints: ApiEndpoint[] }) {
  const ids = operationIds(endpoints);
  const paths: Record<string, Record<string, Schema>> = {};
  for (const endpoint of endpoints) {
    (paths[toOpenApiPath(endpoint.path)] ??= {})[endpoint.method.toLowerCase()] = operation(endpoint, ids.get(endpoint.id)!);
  }
  return {
    openapi: '3.0.3',
    info: { title, version: '1.0.0', description: 'Generated from your endpoints. Each operation runs a workflow.' },
    servers: [{ url: serverUrl }],
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'A token from the sign-in provider of the endpoint' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' }, message: { type: 'string' }, executionId: { type: 'string' } },
          required: ['error'],
        },
      },
    },
  };
}
