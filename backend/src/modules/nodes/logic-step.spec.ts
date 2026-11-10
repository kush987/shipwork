import { ExecutionEngine } from '../execution/application/execution-engine';
import { SyncExecutionRunner } from '../execution/application/sync-execution.runner';
import { InlineStepScheduler } from '../execution/application/inline-step.scheduler';
import { NodeRegistry } from './node-registry';
import { NodeResolver } from './node-resolver';
import { TriggerHttpNode } from './implementations/trigger/trigger-http.node';
import { ConditionNode } from './implementations/logic/condition.node';
import { DataInsertNode } from './implementations/data/data-insert.node';
import { DataQueryNode } from './implementations/data/data-query.node';
import { HttpResponseNode } from './implementations/response/http-response.node';
import { RunCodeNode } from './implementations/transform/run-code.node';
import { QuickJsSandbox } from '../custom-node/infrastructure/quickjs-sandbox';
import { httpTrigger } from './domain/triggers';
import { stepLogicIssues } from './domain/step-logic';
import { WorkflowValidator } from '../workflow/domain/workflow-validator';
import { withoutEmptyLogic } from '../workflow/domain/workflow-definition';
import { FixedScope, InMemoryExecutions } from '../../testing/execution-fakes';
import { inMemoryDataService } from '../../testing/data-fakes';
import type { CustomNodeService } from '../custom-node/application/custom-node.service';
import type { EventDefinitionService } from '../custom-event/application/event-definition.service';
import type { StepLogic, WorkflowDefinition, WorkflowNodeDef } from '../workflow/domain/workflow-definition.types';

const node = (id: string, type: string, config: Record<string, unknown> = {}, logic?: StepLogic): WorkflowNodeDef => ({
  id,
  type,
  name: id,
  position: { x: 0, y: 0 },
  config,
  ...(logic ? { logic } : {}),
});
const edge = (source: string, target: string, sourceHandle = 'default') => ({ id: `${source}-${sourceHandle}-${target}`, source, target, sourceHandle });

const PRODUCT = { name: '{{request.body.name}}', sku: '{{request.body.sku}}', price: '{{request.body.price}}', stock: 1 };

/** POST /products: Create record (with logic) → Return response { product: context.record }. */
const createProduct = (logic: StepLogic): WorkflowDefinition => ({
  nodes: [
    node('trigger', 'trigger.http'),
    node('create', 'data.insert', { collection: 'products', record: PRODUCT, saveAs: 'record' }, logic),
    node('respond', 'http.response', { statusCode: 201, body: { product: '{{context.record}}' } }),
  ],
  edges: [edge('trigger', 'create'), edge('create', 'respond')],
});

describe('step logic (before / after code on built-in steps)', () => {
  let data: ReturnType<typeof inMemoryDataService>;
  let executions: InMemoryExecutions;
  let runner: SyncExecutionRunner;
  let registry: NodeRegistry;

  beforeEach(async () => {
    data = inMemoryDataService();
    await data.service.seedSamples('demo');
    const sandbox = new QuickJsSandbox();
    registry = new NodeRegistry([
      new TriggerHttpNode(),
      new ConditionNode(sandbox),
      new DataInsertNode(data.service, data.sources),
      new DataQueryNode(data.service, data.sources),
      new HttpResponseNode(),
      new RunCodeNode(sandbox),
    ]);
    executions = new InMemoryExecutions();
    const resolver = new NodeResolver(registry, {} as CustomNodeService, sandbox, {} as EventDefinitionService);
    runner = new SyncExecutionRunner(new ExecutionEngine(executions, new InlineStepScheduler(), resolver, new FixedScope()), executions);
  });

  const call = (definition: WorkflowDefinition, body: unknown) =>
    runner.run(
      {
        tenantId: 'demo',
        workflowId: 'wf',
        workflowName: 'API',
        workflowVersion: 1,
        definition,
        trigger: httpTrigger({ method: 'POST', path: '/products', params: {}, query: {}, headers: {}, body, auth: null }, {}),
        shipmentId: null,
        mode: 'api',
      },
      { timeoutMs: 5_000 },
    );
  const stepOutput = (executionId: string, nodeId: string) => [...executions.nodes.values()].find((n) => n.executionId === executionId && n.nodeId === nodeId);
  const products = () => data.service.findRecords('demo', 'products', { limit: 50 });

  it('before() changes the settings a built-in step runs with', async () => {
    const result = await call(
      createProduct({
        before: `function before({ settings, request }) {
          console.log('price was', typeof settings.record.price);
          return { record: { ...settings.record, price: Number(request.body.price), sku: request.body.sku.toUpperCase() } };
        }`,
      }),
      { name: 'Blue shirt', sku: 'shirt-1', price: '200' },
    );
    expect(result).toMatchObject({ kind: 'response', response: { statusCode: 201, body: { product: { name: 'Blue shirt', sku: 'SHIRT-1', price: 200 } } } });
    expect((await products()).find((p) => p.sku === 'SHIRT-1')?.price).toBe(200);
    expect(stepOutput(result.executionId, 'create')?.output).toMatchObject({ logic: { before: { logs: ['price was string'], changed: ['record'] } } });
  });

  it('before() can reject the call with respond(): the step and the rest of the path are skipped', async () => {
    const definition = createProduct({
      before: `function before({ request }) {
        if (!(Number(request.body.price) > 0)) return respond(400, { error: 'price must be a positive number' });
      }`,
    });
    const before = (await products()).length;
    const result = await call(definition, { name: 'Free thing', sku: 'x', price: '-1' });
    expect(result).toMatchObject({ kind: 'response', response: { statusCode: 400, body: { error: 'price must be a positive number' } } });
    expect(await products()).toHaveLength(before);
    expect(stepOutput(result.executionId, 'respond')).toBeUndefined();
    expect(executions.executions.get(result.executionId)).toMatchObject({ status: 'succeeded' });
    // Returning nothing keeps the settings.
    expect(await call(definition, { name: 'Cap', sku: 'cap-1', price: 50 })).toMatchObject({ response: { statusCode: 201, body: { product: { price: 50 } } } });
  });

  it("text from the caller that looks like a placeholder is stored as text, never rendered", async () => {
    const result = await call(
      {
        ...createProduct({ before: `function before({ request }) { return { record: { name: request.body.name, sku: 'leak-1', price: 1, stock: 1 } }; }` }),
      },
      { name: '{{context.secret}} and {{request.headers}}', sku: 'ignored', price: 1 },
    );
    const product = (await products()).find((p) => p.sku === 'leak-1');
    expect(product?.name).toBe('{{context.secret}} and {{request.headers}}');
    expect(result).toMatchObject({ response: { body: { product: { name: '{{context.secret}} and {{request.headers}}' } } } });
  });

  it('after() changes what the step saves and can pick another path', async () => {
    const definition: WorkflowDefinition = {
      nodes: [
        node('trigger', 'trigger.http'),
        node('find', 'data.query', { collection: 'products', filter: '{}', limit: 50, saveAs: 'products' }, {
          after: `function after({ result, path, request }) {
            const cheap = result.filter((p) => p.price <= request.body.maxPrice).map((p) => ({ name: p.name, price: p.price }));
            return cheap.length ? cheap : branch('empty', []);
          }`,
        }),
        node('found', 'http.response', { statusCode: 200, body: { items: '{{context.products}}', count: '{{context.products.length}}' } }),
        node('none', 'http.response', { statusCode: 404, body: { error: 'nothing that cheap' } }),
      ],
      edges: [edge('trigger', 'find'), edge('find', 'found', 'found'), edge('find', 'none', 'empty')],
    };
    const cheap = await call(definition, { maxPrice: 2500 });
    expect(cheap).toMatchObject({ kind: 'response', response: { statusCode: 200 } });
    const body = (cheap as { response: { body: { items: { name: string; price: number }[]; count: number } } }).response.body;
    expect(body.count).toBe(body.items.length);
    expect(body.items.map((p) => p.name).sort()).toEqual(['Cotton kurta', 'Silk dupatta']);
    expect(body.items.every((p) => Object.keys(p).sort().join() === 'name,price')).toBe(true);
    expect(await call(definition, { maxPrice: 1 })).toMatchObject({ response: { statusCode: 404 } });
    expect(stepOutput((await call(definition, { maxPrice: 1 })).executionId, 'find')?.output).toMatchObject({ logic: { after: { changed: true, branch: 'empty' } } });
  });

  it('a unique field refused by the database follows Create record\'s Failed path, with context.lastError', async () => {
    const products = await data.service.getCollection('demo', 'products');
    await data.service.updateCollection('demo', 'products', { fields: products.fields.map((f) => (f.key === 'sku' ? { ...f, unique: true } : f)) });
    // No check step at all — as when two calls race past it: the database still refuses the duplicate.
    const definition: WorkflowDefinition = {
      nodes: [
        node('trigger', 'trigger.http'),
        node('create', 'data.insert', { collection: 'products', record: PRODUCT, saveAs: 'product' }),
        node('created', 'http.response', { statusCode: 201, body: { product: '{{context.product}}' } }),
        node('taken', 'http.response', { statusCode: 409, body: { error: '{{context.lastError.message}}', step: '{{context.lastError.step}}' } }),
      ],
      edges: [edge('trigger', 'create'), edge('create', 'created'), edge('create', 'taken', 'failed')],
    };
    expect(await call(definition, { name: 'Another kurta', sku: 'KUR-001', price: 1 })).toMatchObject({
      kind: 'response',
      response: { statusCode: 409, body: { error: 'A record in “products” already has sku “KUR-001”', step: 'create' } },
    });
    expect(await call(definition, { name: 'New kurta', sku: 'KUR-002', price: 1 })).toMatchObject({ response: { statusCode: 201 } });
  });

  it('fail() and mistakes in the code fail the step with a clear message', async () => {
    const failing = await call(createProduct({ before: `function before() { fail('price is required'); }` }), {});
    expect(failing).toMatchObject({ kind: 'completed', status: 'failed', error: 'create: before(): price is required' });
    const wrongKey = await call(createProduct({ before: `function before() { return { colour: 'red' }; }` }), {});
    expect(wrongKey).toMatchObject({ error: 'create: before() returned “colour”, which isn\'t a setting of “Create record” (settings: collection, record, saveAs)' });
    const wrongPath = await call(createProduct({ after: `function after({ result }) { return branch('nope', result); }` }), { name: 'a', sku: 'b', price: 1 });
    expect(wrongPath).toMatchObject({ error: "create: after() chose branch('nope'), but “Create record” has the paths 'default', 'failed'" });
    const thrown = await call(createProduct({ after: `function after({ result }) { return result.missing.field; }` }), { name: 'a', sku: 'c', price: 1 });
    expect(thrown).toMatchObject({ status: 'failed', error: expect.stringContaining('create: after(): TypeError') });
  });

  it('the validator checks where logic is allowed and that it parses', () => {
    const definition = (type: string) => ({ type, isTrigger: type === 'trigger.http', custom: undefined });
    expect(stepLogicIssues({ before: 'function before() { return {}; }' }, definition('data.insert'))).toEqual([]);
    expect(stepLogicIssues({ before: 'function before( {' }, definition('data.insert'))[0]).toMatch(/syntax error/);
    expect(stepLogicIssues({ after: 'function run() {}' }, definition('data.insert'))).toEqual(['Logic must define `function after(input) { … }`']);
    expect(stepLogicIssues({ before: 'function before() {}' }, definition('trigger.http'))).toEqual(['Triggers start the workflow — add logic to the step after it']);
    expect(stepLogicIssues({ after: 'function after() {}' }, definition('http.response'))[0]).toMatch(/^Return response sends its body as written/);
    expect(stepLogicIssues({ before: '  ', after: '' }, definition('http.response'))).toEqual([]);

    // Saving keeps only hooks with code.
    const saved = withoutEmptyLogic({
      nodes: [node('a', 'data.insert', {}, { before: 'function before() {}', after: null as unknown as string }), node('b', 'data.insert', {}, { before: '  ' })],
      edges: [],
    });
    expect(saved.nodes.map((n) => n.logic)).toEqual([{ before: 'function before() {}' }, undefined]);

    const issues = new WorkflowValidator({ get: (type: string) => registry.get(type) }).validate(createProduct({ before: 'function nope() {}' }));
    expect(issues).toContainEqual({ nodeId: 'create', message: 'create: Logic must define `function before(input) { … }`' });
  });
});
