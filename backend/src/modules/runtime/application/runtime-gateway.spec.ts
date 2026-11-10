import { RuntimeGateway } from './runtime-gateway';
import { EndpointRouter } from './endpoint-router';
import { ApiKeyAuthenticator, PublicAuthenticator } from './endpoint-authenticators';
import { AsyncInvoker, SyncInvoker } from './endpoint-invokers';
import { ExecutionEngine } from '../../execution/application/execution-engine';
import { SyncExecutionRunner } from '../../execution/application/sync-execution.runner';
import { InlineStepScheduler } from '../../execution/application/inline-step.scheduler';
import { NodeRegistry } from '../../nodes/node-registry';
import { NodeResolver } from '../../nodes/node-resolver';
import { TriggerHttpNode } from '../../nodes/implementations/trigger/trigger-http.node';
import { ConditionNode } from '../../nodes/implementations/logic/condition.node';
import { DataGetNode } from '../../nodes/implementations/data/data-get.node';
import { DataInsertNode } from '../../nodes/implementations/data/data-insert.node';
import { DataUpdateNode } from '../../nodes/implementations/data/data-update.node';
import { DataQueryNode } from '../../nodes/implementations/data/data-query.node';
import { RunCodeNode } from '../../nodes/implementations/transform/run-code.node';
import { HttpResponseNode } from '../../nodes/implementations/response/http-response.node';
import { QuickJsSandbox } from '../../custom-node/infrastructure/quickjs-sandbox';
import type { CustomNodeService } from '../../custom-node/application/custom-node.service';
import type { EventDefinitionService } from '../../custom-event/application/event-definition.service';
import { ApiKeyService } from '../../api-key/application/api-key.service';
import type { EndpointService } from '../../endpoint/application/endpoint.service';
import type { WorkflowService } from '../../workflow/application/workflow.service';
import { WORKFLOW_TEMPLATES } from '../../workflow/application/workflow-templates';
import { FixedScope, InMemoryExecutions } from '../../../testing/execution-fakes';
import { inMemoryDataService } from '../../../testing/data-fakes';
import { InMemoryKeys } from '../../../testing/api-key-fakes';
import { EndpointAuthorizer } from './endpoint-authorizer';
import type Redis from 'ioredis';
import type { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import { WorkflowPausedError } from '../../workflow/domain/workflow.errors';
import type { InboundRequest } from './gateway.types';
import { EndpointThrottle } from './endpoint-throttle';
import { InMemoryConcurrencyLimiter, InMemoryRateLimiter } from '../../../shared/rate-limit/in-memory-limiters';
import type { GatewayLimits } from './gateway-limits.types';

const NO_LIMITS: GatewayLimits = { tenantPerMinute: 0, apiKeyPerMinute: 0, ipPerMinute: 0, tenantConcurrentSync: 0 };

const template = (id: string) => WORKFLOW_TEMPLATES.find((t) => t.id === id)!.definition;

const endpoint = (over: Partial<ApiEndpoint>): ApiEndpoint => ({
  id: 'ep',
  tenantId: 'demo',
  name: 'Create order',
  description: '',
  method: 'POST',
  path: '/orders',
  workflowId: 'wf-orders',
  mode: 'sync',
  auth: 'api_key',
  requestSchema: [
    { key: 'customerId', type: 'string', required: true },
    { key: 'productId', type: 'string', required: true },
    { key: 'quantity', type: 'number', required: true },
  ],
  timeoutMs: 10_000,
  rateLimitPerMinute: null,
  authProviderId: null,
  authorizerWorkflowId: null,
  authorizerCacheSeconds: 0,
  enabled: true,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('RuntimeGateway (end to end with the "Create order API" template)', () => {
  const paused = new Set<string>();
  const live: Record<string, { name: string; triggerEvent: string; definition: ReturnType<typeof template> }> = {
    'wf-orders': { name: 'Create order API', triggerEvent: 'http.request', definition: template('api-create-order') },
    'wf-list': { name: 'List products API', triggerEvent: 'http.request', definition: template('api-list-records') },
    'wf-events': { name: 'Shipment flow', triggerEvent: 'shipment.created', definition: template('cod-routing') },
  };
  const workflows = {
    resolvePublished: async (_: string, id: string) => {
      const w = live[id];
      if (!w) throw new Error('not published');
      if (paused.has(id)) throw new WorkflowPausedError(w.name);
      return { workflow: { toJSON: () => ({ id, name: w.name, triggerEvent: w.triggerEvent }) }, version: { version: 3, definition: w.definition } };
    },
  } as unknown as WorkflowService;

  let gateway: RuntimeGateway;
  let executions: InMemoryExecutions;
  let queue: InlineStepScheduler;
  let data: ReturnType<typeof inMemoryDataService>;
  let secret: string;
  let keys: ApiKeyService;
  let products: Record<string, string>;
  let endpoints: ApiEndpoint[];
  let makeGateway: (limits?: GatewayLimits) => RuntimeGateway;
  const concurrency = new InMemoryConcurrencyLimiter();

  beforeEach(async () => {
    data = inMemoryDataService();
    await data.service.seedSamples('demo');
    products = Object.fromEntries((await data.service.findRecords('demo', 'products', { limit: 10 })).map((p) => [p.sku as string, p.id]));

    keys = new ApiKeyService(new InMemoryKeys());
    secret = (await keys.create('demo', 'storefront')).secret;

    const sandbox = new QuickJsSandbox();
    const registry = new NodeRegistry([
      new TriggerHttpNode(),
      new ConditionNode(sandbox),
      new DataGetNode(data.service, data.sources),
      new DataInsertNode(data.service, data.sources),
      new DataUpdateNode(data.service, data.sources),
      new DataQueryNode(data.service, data.sources),
      new RunCodeNode(sandbox),
      new HttpResponseNode(),
    ]);
    const resolver = new NodeResolver(registry, {} as CustomNodeService, sandbox, {} as EventDefinitionService);
    executions = new InMemoryExecutions();
    queue = new InlineStepScheduler();
    const engine = new ExecutionEngine(executions, queue, resolver, new FixedScope());

    endpoints = [
      endpoint({}),
      endpoint({ id: 'ep-list', name: 'List products', method: 'GET', path: '/products', workflowId: 'wf-list', auth: 'none', requestSchema: [{ key: 'maxPrice', type: 'number', required: true }] }),
      endpoint({ id: 'ep-async', name: 'Import order', path: '/orders/import', mode: 'async', auth: 'none', requestSchema: [] }),
      endpoint({ id: 'ep-draft', name: 'Draft', path: '/drafts', workflowId: 'wf-missing', auth: 'none', requestSchema: [] }),
      endpoint({ id: 'ep-wrong', name: 'Wrong trigger', path: '/wrong', workflowId: 'wf-events', auth: 'none', requestSchema: [] }),
    ];
    const router = new EndpointRouter({ listForRouting: async (tenantId: string) => (tenantId === 'demo' ? endpoints : []) } as unknown as EndpointService);
    makeGateway = (limits: GatewayLimits = NO_LIMITS) =>
      new RuntimeGateway(
        router,
        workflows,
        [new PublicAuthenticator(), new ApiKeyAuthenticator(keys)],
        [new SyncInvoker(new SyncExecutionRunner(engine, executions)), new AsyncInvoker(engine)],
        new EndpointThrottle(new InMemoryRateLimiter(), concurrency, limits),
        new EndpointAuthorizer(workflows, new SyncExecutionRunner(engine, executions), {} as Redis),
      );
    gateway = makeGateway();
  });

  const call = (over: Partial<InboundRequest>, target: RuntimeGateway = gateway) =>
    target.handle({ tenantId: 'demo', method: 'POST', path: '/orders', query: {}, headers: { 'x-api-key': secret }, body: {}, requestId: 'req-1', clientIp: '10.0.0.1', ...over });

  it('creates an order: loads the product, prices it in code, saves it, reserves stock and returns 201', async () => {
    const res = await call({ body: { customerId: 'c1', productId: products['KUR-001'], quantity: 2 } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ orderId: expect.stringMatching(/^rec_/), total: 2598, discountPct: 0, status: 'CREATED' });
    expect(res.executionId).toBeDefined();

    const [order] = await data.service.findRecords('demo', 'orders', {});
    expect(order).toMatchObject({ customerId: 'c1', quantity: 2, total: 2598, status: 'CREATED' });
    expect((await data.service.getRecord('demo', 'products', products['KUR-001']))!.stock).toBe(38);

    const run = executions.executions.get(res.executionId!)!;
    expect(run).toMatchObject({ mode: 'api', status: 'succeeded', response: { statusCode: 201 } });
    const request = (run.trigger.data as { request: { headers: Record<string, string> } }).request;
    expect(request.headers['x-api-key']).toBeUndefined(); // credentials never reach the workflow
  });

  it('applies the 10% discount above ₹5,000 (logic in the code step)', async () => {
    const res = await call({ body: { customerId: 'c1', productId: products['SAR-010'], quantity: 1 } });
    expect(res.body).toMatchObject({ total: 7199.1, discountPct: 10 });
  });

  it('branches to 409 when stock is short and 404 for unknown products', async () => {
    expect(await call({ body: { customerId: 'c1', productId: products['SAR-010'], quantity: 5 } })).toMatchObject({
      status: 409,
      body: { error: 'Insufficient stock', available: 3 },
    });
    expect(await call({ body: { customerId: 'c1', productId: 'rec_nope', quantity: 1 } })).toMatchObject({ status: 404, body: { error: 'Product not found' } });
  });

  it('rejects missing, wrong and revoked API keys', async () => {
    expect((await call({ headers: {} })).status).toBe(401);
    expect((await call({ headers: { authorization: 'Bearer sk_wrongwrongwrongwrong' } })).status).toBe(401);
    expect((await call({ headers: { authorization: `Bearer ${secret}` }, body: { customerId: 'c', productId: products['KUR-001'], quantity: 1 } })).status).toBe(201);
    const [key] = await keys.list('demo');
    await keys.revoke('demo', key.id);
    expect((await call({})).status).toBe(401);
    expect((await call({ tenantId: 'other' })).status).toBe(404); // another tenant's endpoints are invisible
  });

  it('validates input against the request schema before running anything', async () => {
    const res = await call({ body: { customerId: 'c1', productId: 'p', quantity: 'two' } });
    expect(res).toMatchObject({ status: 422, body: { error: 'invalid_request', issues: [{ field: 'quantity', message: 'quantity must be a number' }] } });
    expect(executions.executions.size).toBe(0);
  });

  it('routes by path and method, coercing query strings for reads', async () => {
    expect(await call({ path: '/nothing' })).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect(await call({ method: 'DELETE' })).toMatchObject({ status: 405, headers: { allow: 'POST' }, body: { allowed: ['POST'] } });
    const list = await call({ method: 'GET', path: '/products', headers: {}, query: { maxPrice: '2500' } });
    expect(list.status).toBe(200);
    expect((list.body as { items: { sku: string }[] }).items.map((p) => p.sku)).toEqual(['KUR-001', 'DUP-004']);
  });

  it('answers 503 while the workflow is unpublished or has the wrong trigger, or the endpoint is disabled', async () => {
    expect(await call({ path: '/drafts' })).toMatchObject({ status: 503, body: { error: 'endpoint_unavailable' } });
    expect((await call({ path: '/wrong' })).body).toMatchObject({ message: expect.stringContaining('API request trigger') });
    endpoints[0] = { ...endpoints[0], enabled: false };
    expect((await call({ body: { customerId: 'c', productId: 'p', quantity: 1 } })).status).toBe(503);
  });

  it('answers 503 “paused” while the workflow is paused, and serves again once it is resumed', async () => {
    const list = () => call({ method: 'GET', path: '/products', query: { maxPrice: '5000' }, headers: {} });
    paused.add('wf-list');
    try {
      expect(await list()).toMatchObject({ status: 503, body: { error: 'endpoint_unavailable', message: 'The workflow behind this endpoint is paused' } });
      expect(executions.executions.size).toBe(0);
    } finally {
      paused.delete('wf-list');
    }
    expect((await list()).status).toBe(200);
  });

  it('queues async endpoints and answers 202 with the execution id', async () => {
    const res = await call({ path: '/orders/import', headers: {} });
    expect(res).toMatchObject({ status: 202, body: { status: 'queued', executionId: res.executionId } });
    expect(queue.pending).toBe(1); // handed to the queue, not run inline
  });

  describe('limits', () => {
    const order = () => ({ body: { customerId: 'c1', productId: products['KUR-001'], quantity: 1 } });

    it('refuses an API key past its per-minute limit with 429, Retry-After and rate-limit headers', async () => {
      const limited = makeGateway({ ...NO_LIMITS, apiKeyPerMinute: 2 });
      const first = await call(order(), limited);
      expect(first.status).toBe(201);
      expect(first.headers).toMatchObject({ 'ratelimit-limit': '2', 'ratelimit-remaining': '1' });
      expect((await call(order(), limited)).status).toBe(201);
      const refused = await call(order(), limited);
      expect(refused).toMatchObject({
        status: 429,
        headers: { 'retry-after': '30', 'ratelimit-remaining': '0' },
        body: { error: 'rate_limited', message: 'Too many calls with this API key — try again in 30 s', limit: 2, retryAfterSeconds: 30 },
      });
      expect(refused.executionId).toBeUndefined();
    });

    it('limits public endpoints per client address, independently for each address', async () => {
      const limited = makeGateway({ ...NO_LIMITS, ipPerMinute: 1 });
      const list = (clientIp: string) => call({ method: 'GET', path: '/products', query: { maxPrice: '2000' }, headers: {}, clientIp }, limited);
      expect((await list('1.1.1.1')).status).toBe(200);
      expect((await list('1.1.1.1')).body).toMatchObject({ error: 'rate_limited', message: expect.stringContaining('from your address') });
      expect((await list('2.2.2.2')).status).toBe(200);
    });

    it("applies an endpoint's own limit before the account-wide ones", async () => {
      endpoints[0] = { ...endpoints[0], rateLimitPerMinute: 1 };
      const limited = makeGateway({ ...NO_LIMITS, apiKeyPerMinute: 100, tenantPerMinute: 1000 });
      expect((await call(order(), limited)).status).toBe(201);
      expect((await call(order(), limited)).body).toMatchObject({ message: expect.stringContaining('to this endpoint') });
    });

    it('caps the whole account across callers', async () => {
      const limited = makeGateway({ ...NO_LIMITS, tenantPerMinute: 1 });
      expect((await call(order(), limited)).status).toBe(201);
      const refused = await call({ method: 'GET', path: '/products', query: { maxPrice: '2000' }, headers: {}, clientIp: '9.9.9.9' }, limited);
      expect(refused.body).toMatchObject({ message: expect.stringContaining('this account’s endpoints') });
    });

    it('does not count calls that never reach a known endpoint or fail authentication', async () => {
      const limited = makeGateway({ ...NO_LIMITS, tenantPerMinute: 1 });
      expect((await call({ path: '/nope' }, limited)).status).toBe(404);
      expect((await call({ headers: {} }, limited)).status).toBe(401);
      expect((await call(order(), limited)).status).toBe(201);
    });

    it('refuses sync calls beyond the concurrent cap and frees the slot when a call answers', async () => {
      const limited = makeGateway({ ...NO_LIMITS, tenantConcurrentSync: 1 });
      const held = await concurrency.acquire('sync:demo', 1, 60_000);
      const refused = await call(order(), limited);
      expect(refused).toMatchObject({ status: 429, headers: { 'retry-after': '1' }, body: { error: 'too_many_concurrent_calls', limit: 1 } });
      await concurrency.release('sync:demo', held!);
      expect((await call(order(), limited)).status).toBe(201);
      expect(await concurrency.count('sync:demo')).toBe(0);
      // Async calls don't hold a sync slot.
      await concurrency.acquire('sync:demo', 1, 60_000);
      expect((await call({ path: '/orders/import', headers: {} }, limited)).status).toBe(202);
    });
  });
});
