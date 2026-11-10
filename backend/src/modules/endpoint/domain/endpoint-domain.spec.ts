import { endpointIssues, validateRequestInput } from './api-endpoint';
import { matchPath, normalizePath, pathIssues, pathParams, pathShape, specificity, toOpenApiPath } from './path-pattern';
import { buildOpenApi } from '../application/openapi.builder';
import { readinessIssues } from '../application/endpoint.helpers';

describe('endpoint paths', () => {
  it('normalizes and validates', () => {
    expect(normalizePath(' Orders//:orderId/ ')).toBe('/orders/:orderId');
    expect(pathIssues('/orders/:id')).toEqual([]);
    expect(pathIssues('/orders/:id/:id')[0]).toContain('used twice');
    expect(pathIssues('/or ders')[0]).toContain('lowercase');
    expect(pathIssues('/:1x')[0]).toContain('Path parameter');
  });

  it('matches concrete paths and decodes parameters', () => {
    expect(matchPath('/orders/:id', '/orders/A%20B')).toEqual({ id: 'A B' });
    expect(matchPath('/orders/:id', '/ORDERS/42')).toEqual({ id: '42' });
    expect(matchPath('/orders/:id', '/orders')).toBeNull();
    expect(matchPath('/orders/:id', '/orders/%E0%A4%A')).toBeNull();
    expect(matchPath('/', '/')).toEqual({});
  });

  it('knows shape, params, specificity and OpenAPI form', () => {
    expect(pathShape('/orders/:id')).toBe(pathShape('/orders/:orderId'));
    expect(pathParams('/a/:x/b/:y')).toEqual(['x', 'y']);
    expect(specificity('/orders/summary')).toBeGreaterThan(specificity('/orders/:id'));
    expect(toOpenApiPath('/orders/:id')).toBe('/orders/{id}');
  });
});

describe('endpoint rules', () => {
  it('reports every problem with an endpoint definition', () => {
    const issues = endpointIssues({ name: ' ', method: 'GET', path: '/x y', timeoutMs: 99, requestSchema: [{ key: '1a', type: 'string', required: true }] });
    expect(issues.map((i) => i.message)).toEqual([
      'Name is required',
      expect.stringContaining('Path segment'),
      expect.stringContaining('Field 1'),
      expect.stringContaining('Timeout'),
    ]);
  });

  it('validates the body for writes and coerces the query for reads', () => {
    const schema = [
      { key: 'productId', type: 'string' as const, required: true },
      { key: 'quantity', type: 'number' as const, required: true },
    ];
    expect(validateRequestInput({ method: 'POST', requestSchema: schema }, { body: { productId: 'p', quantity: '2' }, query: {} }).issues).toEqual([
      { field: 'quantity', message: 'quantity must be a number' },
    ]);
    expect(validateRequestInput({ method: 'POST', requestSchema: schema }, { body: 'text', query: {} }).issues[0].field).toBe('body');
    const read = validateRequestInput({ method: 'GET', requestSchema: schema }, { body: null, query: { productId: 'p', quantity: '2' } });
    expect(read).toMatchObject({ issues: [], query: { quantity: 2 } });
    expect(validateRequestInput({ method: 'POST', requestSchema: [] }, { body: 'anything', query: {} }).issues).toEqual([]);
  });

  it('explains why an endpoint is not ready', () => {
    const workflow = { id: 'wf', name: 'Orders', status: 'draft' as const, publishedVersion: null, triggerEvent: null };
    const ep = { enabled: true, auth: 'none' as const, authProviderId: null, authorizerWorkflowId: null };
    const live = { ...workflow, publishedVersion: 2, triggerEvent: 'http.request' };
    expect(readinessIssues(ep, workflow)).toEqual(['Workflow “Orders” isn\'t published yet']);
    expect(readinessIssues(ep, { ...workflow, publishedVersion: 1, triggerEvent: 'shipment.created' })[0]).toContain('API request');
    expect(readinessIssues({ ...ep, enabled: false }, null)).toHaveLength(2);
    expect(readinessIssues(ep, live)).toEqual([]);
    expect(readinessIssues(ep, { ...live, paused: true })).toEqual(['Workflow “Orders” is paused — resume it on the Workflows page']);
    // Sign-in provider and authorizer workflow are checked too.
    const context = { workflows: { auth: { ...workflow, id: 'auth', name: 'Check access' } }, providerIds: new Set(['ap_1']) };
    expect(readinessIssues({ ...ep, auth: 'jwt', authProviderId: 'ap_gone' }, live, context)).toEqual(['Its sign-in provider no longer exists — choose another one']);
    expect(readinessIssues({ ...ep, auth: 'jwt', authProviderId: 'ap_1', authorizerWorkflowId: 'auth' }, live, context)).toEqual(['Authorizer workflow “Check access” isn\'t published yet']);
    expect(readinessIssues({ ...ep, authorizerWorkflowId: 'deleted' }, live, context)).toEqual(['Its authorizer workflow was deleted — choose another one']);
  });
});

describe('OpenAPI builder', () => {
  const base = { tenantId: 't', description: '', workflowId: 'wf', timeoutMs: 10_000, rateLimitPerMinute: null, authProviderId: null, authorizerWorkflowId: null, authorizerCacheSeconds: 0, enabled: true, createdAt: '', updatedAt: '' };
  const doc = buildOpenApi({
    title: 't API',
    serverUrl: '/api/run/t',
    endpoints: [
      { ...base, id: 'e1', name: 'Create order', method: 'POST', path: '/orders', mode: 'sync', auth: 'api_key', requestSchema: [{ key: 'qty', type: 'number', required: true }] },
      { ...base, id: 'e2', name: 'Get order', method: 'GET', path: '/orders/:id', mode: 'async', auth: 'none', requestSchema: [{ key: 'expand', type: 'boolean', required: false }] },
      { ...base, id: 'e3', name: 'Create order', method: 'PUT', path: '/orders/:id', mode: 'sync', auth: 'none', requestSchema: [], rateLimitPerMinute: 60 },
      { ...base, id: 'e4', name: 'My orders', method: 'GET', path: '/my/orders', mode: 'sync', auth: 'jwt', authProviderId: 'ap_1', authorizerWorkflowId: 'wf_authz', requestSchema: [] },
    ],
  });

  it('describes paths, parameters, bodies, auth and responses', () => {
    const create = doc.paths['/orders'].post as Record<string, any>;
    expect(create.operationId).toBe('createOrder');
    expect(create.requestBody.content['application/json'].schema).toMatchObject({ properties: { qty: { type: 'number' } }, required: ['qty'] });
    expect(create.security).toEqual([{ apiKey: [] }]);
    expect(Object.keys(create.responses)).toEqual(['200', '401', '403', '422', '429', '500', '504']);
    expect(create.responses['429'].headers).toHaveProperty('Retry-After');
    const mine = doc.paths['/my/orders'].get as Record<string, any>;
    expect(mine.security).toEqual([{ bearerAuth: [] }]);
    expect(mine.responses['401'].description).toContain('sign-in token');
    expect(mine.responses['403'].description).toContain('authorizer');
    expect((doc.components.securitySchemes as Record<string, unknown>).bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });

    const get = doc.paths['/orders/{id}'].get as Record<string, any>;
    expect(get.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'expand', in: 'query', required: false, schema: { type: 'boolean' } },
    ]);
    expect(get.responses['202']).toBeDefined();
    expect((doc.paths['/orders/{id}'].put as Record<string, any>).operationId).toBe('createOrder2');
    expect((doc.paths['/orders/{id}'].put as Record<string, any>).description).toBe('Rate limit: 60 calls per minute per caller.');
    expect(doc.servers).toEqual([{ url: '/api/run/t' }]);
  });
});
