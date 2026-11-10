import { RuntimeGateway } from './runtime-gateway';
import { EndpointRouter } from './endpoint-router';
import { ApiKeyAuthenticator, JwtAuthenticator, PublicAuthenticator } from './endpoint-authenticators';
import { AsyncInvoker, SyncInvoker } from './endpoint-invokers';
import { EndpointThrottle } from './endpoint-throttle';
import { EndpointAuthorizer } from './endpoint-authorizer';
import { ExecutionEngine } from '../../execution/application/execution-engine';
import { SyncExecutionRunner } from '../../execution/application/sync-execution.runner';
import { InlineStepScheduler } from '../../execution/application/inline-step.scheduler';
import { NodeRegistry } from '../../nodes/node-registry';
import { NodeResolver } from '../../nodes/node-resolver';
import { TriggerHttpNode } from '../../nodes/implementations/trigger/trigger-http.node';
import { DataGetNode } from '../../nodes/implementations/data/data-get.node';
import { DataInsertNode } from '../../nodes/implementations/data/data-insert.node';
import { DataQueryNode } from '../../nodes/implementations/data/data-query.node';
import { HttpResponseNode } from '../../nodes/implementations/response/http-response.node';
import { AuthorizeNode } from '../../nodes/implementations/access/authorize.node';
import { AccessDecisionNode } from '../../nodes/implementations/access/access-decision.node';
import { HashPasswordNode, VerifyPasswordNode } from '../../nodes/implementations/access/password.nodes';
import { IssueTokenNode } from '../../nodes/implementations/access/issue-token.node';
import { ApiKeyService } from '../../api-key/application/api-key.service';
import { WORKFLOW_TEMPLATES } from '../../workflow/application/workflow-templates';
import { FixedScope, InMemoryExecutions } from '../../../testing/execution-fakes';
import { inMemoryDataService } from '../../../testing/data-fakes';
import { InMemoryKeys } from '../../../testing/api-key-fakes';
import { appAuthFixture } from '../../../testing/app-auth-fakes';
import { InMemoryConcurrencyLimiter, InMemoryRateLimiter } from '../../../shared/rate-limit/in-memory-limiters';
import type Redis from 'ioredis';
import type { CustomNodeService } from '../../custom-node/application/custom-node.service';
import type { CodeSandbox } from '../../custom-node/application/code-sandbox.ports';
import type { EventDefinitionService } from '../../custom-event/application/event-definition.service';
import type { EndpointService } from '../../endpoint/application/endpoint.service';
import type { WorkflowService } from '../../workflow/application/workflow.service';
import type { WorkflowDefinition } from '../../workflow/domain/workflow-definition.types';
import type { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import type { InboundRequest } from './gateway.types';

const template = (id: string): WorkflowDefinition => structuredClone(WORKFLOW_TEMPLATES.find((t) => t.id === id)!.definition);
const NO_LIMITS = { tenantPerMinute: 0, apiKeyPerMinute: 0, ipPerMinute: 0, tenantConcurrentSync: 0 };

/** trigger → Return response with whatever request.auth is. */
const ECHO: WorkflowDefinition = {
  nodes: [
    { id: 't', type: 'trigger.http', name: 'API', position: { x: 0, y: 0 }, config: {} },
    { id: 'r', type: 'http.response', name: 'Echo', position: { x: 1, y: 0 }, config: { statusCode: 200, body: { auth: '{{request.auth}}' } } },
  ],
  edges: [{ id: 'e', source: 't', sourceHandle: 'default', target: 'r' }],
};
/** An authorizer that forgets to decide. */
const UNDECIDED: WorkflowDefinition = { nodes: [ECHO.nodes[0]], edges: [] };

const endpoint = (over: Partial<ApiEndpoint>): ApiEndpoint => ({
  id: 'ep',
  tenantId: 'demo',
  name: 'Endpoint',
  description: '',
  method: 'GET',
  path: '/x',
  workflowId: 'wf-echo',
  mode: 'sync',
  auth: 'none',
  requestSchema: [],
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

class MapRedis {
  readonly store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
    return 'OK';
  }
}

describe('IAM for the apps workspaces build (gateway, end to end)', () => {
  let gateway: RuntimeGateway;
  let executions: InMemoryExecutions;
  let keys: ApiKeyService;
  let tokens: ReturnType<typeof appAuthFixture>['tokens'];
  let providerId: string;
  let users: Record<string, string>;
  let redis: MapRedis;

  beforeEach(async () => {
    const data = inMemoryDataService();
    await data.service.seedSamples('demo');
    users = Object.fromEntries((await data.service.findRecords('demo', 'app_users', {})).map((u) => [u.email as string, u.id]));
    const auth = appAuthFixture();
    tokens = auth.tokens;
    providerId = (await auth.providers.create('demo', { name: 'Shop app', type: 'shipflow' })).id;
    keys = new ApiKeyService(new InMemoryKeys());

    const login = template('api-login');
    login.nodes.find((n) => n.id === 'token')!.config!.provider = providerId;
    const live: Record<string, WorkflowDefinition> = {
      'wf-signup': template('api-signup'),
      'wf-login': login,
      'wf-admin': template('api-admin-only'),
      'wf-my-orders': template('api-my-orders'),
      'wf-authorizer': template('api-authorizer-roles'),
      'wf-echo': ECHO,
      'wf-undecided': UNDECIDED,
    };
    const workflows = {
      resolvePublished: async (_: string, id: string) => {
        if (!live[id]) throw new Error('not published');
        return { workflow: { toJSON: () => ({ id, name: id, triggerEvent: 'http.request' }) }, version: { version: 1, definition: live[id] } };
      },
    } as unknown as WorkflowService;

    const registry = new NodeRegistry([
      new TriggerHttpNode(),
      new DataGetNode(data.service, data.sources),
      new DataInsertNode(data.service, data.sources),
      new DataQueryNode(data.service, data.sources),
      new HttpResponseNode(),
      new AuthorizeNode(),
      new AccessDecisionNode(),
      new HashPasswordNode(),
      new VerifyPasswordNode(),
      new IssueTokenNode(tokens),
    ]);
    executions = new InMemoryExecutions();
    const engine = new ExecutionEngine(executions, new InlineStepScheduler(), new NodeResolver(registry, {} as CustomNodeService, {} as CodeSandbox, {} as EventDefinitionService), new FixedScope());
    const runner = new SyncExecutionRunner(engine, executions);
    const jwt = { auth: 'jwt' as const, authProviderId: providerId };
    const endpoints = [
      endpoint({ id: 'ep-signup', method: 'POST', path: '/signup', workflowId: 'wf-signup' }),
      endpoint({ id: 'ep-login', method: 'POST', path: '/login', workflowId: 'wf-login' }),
      endpoint({ id: 'ep-admin', path: '/admin/report', workflowId: 'wf-admin', ...jwt }),
      endpoint({ id: 'ep-mine', path: '/my/orders', workflowId: 'wf-my-orders', ...jwt, authorizerWorkflowId: 'wf-authorizer' }),
      endpoint({ id: 'ep-stats', path: '/admin/stats', workflowId: 'wf-echo', ...jwt, authorizerWorkflowId: 'wf-authorizer', authorizerCacheSeconds: 60 }),
      endpoint({ id: 'ep-undecided', path: '/undecided', workflowId: 'wf-echo', ...jwt, authorizerWorkflowId: 'wf-undecided' }),
      endpoint({ id: 'ep-key-a', path: '/partner/a', auth: 'api_key' }),
      endpoint({ id: 'ep-key-b', path: '/partner/b', auth: 'api_key' }),
    ];
    const router = new EndpointRouter({ listForRouting: async () => endpoints } as unknown as EndpointService);
    redis = new MapRedis();
    gateway = new RuntimeGateway(
      router,
      workflows,
      [new PublicAuthenticator(), new ApiKeyAuthenticator(keys), new JwtAuthenticator(tokens)],
      [new SyncInvoker(runner), new AsyncInvoker(engine)],
      new EndpointThrottle(new InMemoryRateLimiter(), new InMemoryConcurrencyLimiter(), NO_LIMITS),
      new EndpointAuthorizer(workflows, runner, redis as unknown as Redis),
    );
  });

  const call = (method: string, path: string, over: Partial<InboundRequest> = {}) =>
    gateway.handle({ tenantId: 'demo', method, path, query: {}, headers: {}, body: null, requestId: 'r', clientIp: '1.1.1.1', ...over });
  const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
  const login = async (email: string, password: string) => call('POST', '/login', { body: { email, password } });
  const tokenFor = async (email: string, password: string) => ((await login(email, password)).body as { token: string }).token;

  it('sign-up stores a hashed password; login issues a token; duplicates and wrong passwords are refused', async () => {
    const signup = await call('POST', '/signup', { body: { email: 'new@shop.in', name: 'New', password: 'a-long-password' } });
    expect(signup).toMatchObject({ status: 201, body: { id: expect.any(String), email: 'new@shop.in' } });
    expect((await call('POST', '/signup', { body: { email: 'new@shop.in', name: 'Again', password: 'whatever-pass' } })).status).toBe(409);

    const ok = await login('new@shop.in', 'a-long-password');
    expect(ok).toMatchObject({ status: 200, body: { token: expect.stringMatching(/^ey/), tokenType: 'Bearer', expiresAt: expect.any(String) } });
    expect(await tokens.verify('demo', providerId, (ok.body as { token: string }).token)).toMatchObject({ roles: ['customer'], claims: { email: 'new@shop.in' } });
    expect(await login('new@shop.in', 'wrong-password')).toMatchObject({ status: 401, body: { error: 'Invalid email or password' } });
    expect(await login('nobody@shop.in', 'a-long-password')).toMatchObject({ status: 401, body: { error: 'Invalid email or password' } });
  });

  it('JWT endpoints: the token decides who the caller is (request.auth); missing or bad tokens get 401', async () => {
    const admin = await tokenFor('admin@example.com', 'admin-password-1');
    expect(await call('GET', '/admin/report', bearer(admin))).toMatchObject({ status: 200, body: { user: users['admin@example.com'] } });
    const customer = await tokenFor('customer@example.com', 'customer-password-1');
    expect(await call('GET', '/admin/report', bearer(customer))).toMatchObject({ status: 403, body: { error: 'Admins only', reason: 'No statement allows reports:read on *' } });

    expect(await call('GET', '/admin/report')).toMatchObject({ status: 401, headers: { 'www-authenticate': 'Bearer' }, body: { error: 'unauthorized' } });
    expect(await call('GET', '/admin/report', bearer('not-a-token'))).toMatchObject({ status: 401, body: { message: 'Not a valid token' } });
  });

  it('authorizer workflow: allows by role, passes context on, denies others with its own status and message', async () => {
    const admin = await tokenFor('admin@example.com', 'admin-password-1');
    const customer = await tokenFor('customer@example.com', 'customer-password-1');

    const stats = await call('GET', '/admin/stats', bearer(admin));
    expect(stats).toMatchObject({
      status: 200,
      body: { auth: { type: 'jwt', id: users['admin@example.com'], roles: ['admin'], context: { email: 'admin@example.com', roles: ['admin'] } } },
    });
    expect(await call('GET', '/admin/stats', bearer(customer))).toMatchObject({ status: 403, body: { error: 'forbidden', message: 'Your role does not allow this' } });
    expect((await call('GET', '/my/orders', bearer(customer))).status).toBe(200);

    // A valid token for a user who no longer exists.
    const ghost = (await tokens.issue('demo', providerId, { sub: 'rec_deleted', roles: ['admin'] })).token;
    expect(await call('GET', '/admin/stats', bearer(ghost))).toMatchObject({ status: 401, body: { error: 'unauthorized', message: 'Unknown user “rec_deleted” — sign in again' } });
  });

  it('authorizers fail closed and can cache decisions per caller, method and path', async () => {
    const admin = await tokenFor('admin@example.com', 'admin-password-1');
    expect(await call('GET', '/undecided', bearer(admin))).toMatchObject({ status: 403, body: { message: expect.stringContaining('no Access decision step ran') } });

    const authorizerRuns = () => [...executions.executions.values()].filter((e) => e.workflowId === 'wf-authorizer').length;
    const before = authorizerRuns();
    await call('GET', '/admin/stats', bearer(admin));
    await call('GET', '/admin/stats', bearer(admin));
    expect(authorizerRuns() - before).toBe(1);
    expect([...redis.store.keys()].some((k) => k.startsWith('shipflow:authz:ep-stats:'))).toBe(true);
  });

  it('API key scopes: a key limited to some endpoints gets 403 elsewhere; request.auth names the key', async () => {
    const { apiKey, secret } = await keys.create('demo', 'Partner A', ['ep-key-a']);
    const withKey = { headers: { 'x-api-key': secret } };
    expect(await call('GET', '/partner/a', withKey)).toMatchObject({ status: 200, body: { auth: { type: 'api_key', id: apiKey.id, name: 'Partner A', roles: [] } } });
    expect(await call('GET', '/partner/b', withKey)).toMatchObject({ status: 403, body: { error: 'forbidden', message: 'This API key may not call this endpoint' } });
    await keys.setScope('demo', apiKey.id, null);
    expect((await call('GET', '/partner/b', withKey)).status).toBe(200);
    await expect(keys.setScope('demo', apiKey.id, [])).rejects.toThrow('Choose at least one endpoint');
  });
});
