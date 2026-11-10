import { BuiltinNodeEditService } from './builtin-node-edits.service';
import { NodeRegistry } from '../node-registry';
import { NodeResolver } from '../node-resolver';
import { TriggerHttpNode } from '../implementations/trigger/trigger-http.node';
import { HttpResponseNode } from '../implementations/response/http-response.node';
import { DataInsertNode } from '../implementations/data/data-insert.node';
import { DataQueryNode } from '../implementations/data/data-query.node';
import { RunWorkflowNode } from '../implementations/flow/run-workflow.node';
import { WorkflowCalls } from '../domain/workflow-caller';
import { ExecutionEngine } from '../../execution/application/execution-engine';
import { InlineStepScheduler } from '../../execution/application/inline-step.scheduler';
import { SyncExecutionRunner } from '../../execution/application/sync-execution.runner';
import { httpTrigger, toWorkflowRequest } from '../domain/triggers';
import { QuickJsSandbox } from '../../custom-node/infrastructure/quickjs-sandbox';
import { FixedScope, InMemoryExecutions } from '../../../testing/execution-fakes';
import { inMemoryDataService } from '../../../testing/data-fakes';
import { InMemoryBuiltinNodeEdits } from '../../../testing/builtin-node-fakes';
import { NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import type { CustomNodeService } from '../../custom-node/application/custom-node.service';
import type { EventDefinitionService } from '../../custom-event/application/event-definition.service';
import type { ExecutionMode } from '../../execution/domain/execution.types';
import type { WorkflowDefinition } from '../../workflow/domain/workflow-definition.types';

const STAMP = `function before({ settings, request }) {
  return { record: { ...settings.record, createdBy: request.auth ? request.auth.id : 'anonymous', tag: 'workspace' } };
}`;
const LAST_WORD = `function after({ result }) {
  return { ...result, checkedBy: 'workspace' };
}`;

describe('Built-in steps a workspace changes', () => {
  let edits: InMemoryBuiltinNodeEdits;
  let service: BuiltinNodeEditService;
  let resolver: NodeResolver;
  let data: ReturnType<typeof inMemoryDataService>;
  let runner: SyncExecutionRunner;
  let executions: InMemoryExecutions;

  beforeEach(async () => {
    const sandbox = new QuickJsSandbox();
    data = inMemoryDataService();
    await data.service.seedSamples('t');
    const registry = new NodeRegistry([
      new TriggerHttpNode(),
      new HttpResponseNode(),
      new DataInsertNode(data.service, data.sources),
      new DataQueryNode(data.service, data.sources),
      new RunWorkflowNode(new WorkflowCalls()),
    ]);
    edits = new InMemoryBuiltinNodeEdits();
    service = new BuiltinNodeEditService(registry, edits);
    resolver = new NodeResolver(registry, { list: async () => [] } as unknown as CustomNodeService, sandbox, {} as EventDefinitionService, edits);
    executions = new InMemoryExecutions();
    runner = new SyncExecutionRunner(new ExecutionEngine(executions, new InlineStepScheduler(), resolver, new FixedScope()), executions);
  });

  describe('saving', () => {
    it('stores only real changes, as a new version, and nothing when nothing changed', async () => {
      const saved = await service.save('t', 'data.query', { label: ' Search ', icon: 'filter', defaults: { limit: 50, sort: '{"createdAt": -1}' } }, 'a@b.c');
      expect(saved.edit).toMatchObject({ version: 1, label: 'Search', icon: 'filter', defaults: { limit: 50 }, createdBy: 'a@b.c', reset: false });
      expect(saved).toMatchObject({ label: 'Search', edited: true, base: { label: 'Find records' } });
      await service.save('t', 'data.query', { label: 'Search', icon: 'filter', defaults: { limit: 50 } }, 'a@b.c');
      expect(edits.rows).toHaveLength(1);
      expect((await service.save('t', 'data.query', { label: 'Find records' }, null)).edit).toMatchObject({ version: 2, defaults: {} });
      expect((await service.get('t', 'data.query')).history.map((h) => h.changes)).toEqual([[], ['name', 'icon', 'default limit']]);
    });

    it('refuses defaults a setting can’t take, unknown settings, and logic on steps that can’t have it', async () => {
      const issues = await service
        .save('t', 'flow.run_workflow', { defaults: { mode: 'later', timeoutSeconds: '10', nope: 1 }, icon: 'Not An Icon' }, null)
        .catch((e: ValidationFailedError) => e.issues.map((i) => i.message));
      expect(issues).toEqual([
        '“Not An Icon” is not an icon name',
        'Mode must be one of wait, background',
        'Wait at most (seconds) must be a number',
        '“Run workflow” has no setting “nope”',
      ]);
      const trigger = await service.save('t', 'trigger.http', { logic: { before: 'function before() {}' } }, null).catch((e: ValidationFailedError) => e.issues[0].message);
      expect(trigger).toMatch(/^Triggers start the workflow/);
      const broken = await service.save('t', 'data.insert', { logic: { before: 'function before( {' } }, null).catch((e: ValidationFailedError) => e.issues[0].message);
      expect(broken).toMatch(/^before\(\) logic has a syntax error/);
      await expect(service.get('t', 'custom.risk')).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.get('t', 'no.such')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('resets to the app’s own as a new version, keeping the history (built-in steps can’t be deleted)', async () => {
      await service.save('t', 'data.insert', { label: 'Save', logic: { before: STAMP } }, null);
      const reset = await service.reset('t', 'data.insert', 'a@b.c');
      expect(reset).toMatchObject({ label: 'Create record', edited: false, edit: { version: 2, reset: true } });
      expect(reset.history.map((h) => h.changes)).toEqual([['reset to default'], ['name', 'workspace logic']]);
      await service.reset('t', 'data.insert', null);
      expect(edits.rows).toHaveLength(2);
    });
  });

  it('shows the changes in the palette: name, description, icon and defaults, with a note of workspace logic', async () => {
    await service.save('t', 'data.query', { label: 'Search', description: 'Looks things up', defaults: { limit: 50 } }, null);
    await service.save('t', 'data.insert', { logic: { before: STAMP } }, null);
    const catalog = await resolver.catalog('t');
    const query = catalog.find((d) => d.type === 'data.query')!;
    expect(query).toMatchObject({ label: 'Search', description: 'Looks things up', icon: 'search', edit: { version: 1, logic: false } });
    expect(query.configSchema.find((f) => f.key === 'limit')!.default).toBe(50);
    expect(catalog.find((d) => d.type === 'data.insert')).toMatchObject({ label: 'Create record', edit: { version: 1, logic: true } });
    expect(catalog.find((d) => d.type === 'http.response')!.edit).toBeUndefined();
    expect((await resolver.catalog('other')).find((d) => d.type === 'data.query')!.label).toBe('Find records');
  });

  describe('workspace logic at run time', () => {
    /** API request → Create record (with its own step logic) → Return response with what was saved. */
    const definition = (typeVersion?: number): WorkflowDefinition => ({
      nodes: [
        { id: 'trigger', type: 'trigger.http', name: 'API request', position: { x: 0, y: 0 }, config: {} },
        {
          id: 'save',
          type: 'data.insert',
          name: 'Save order',
          position: { x: 300, y: 0 },
          config: { collection: 'orders', record: { customerId: 'c1', productId: 'p1', quantity: 1, total: 10, status: 'NEW' }, saveAs: 'order' },
          logic: { before: `function before({ settings }) { return { record: { ...settings.record, tag: 'step' } }; }` },
          ...(typeVersion ? { typeVersion } : {}),
        },
        { id: 'answer', type: 'http.response', name: 'Return', position: { x: 600, y: 0 }, config: { statusCode: 200, body: { order: '{{context.order}}' } } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', sourceHandle: 'default', target: 'save' },
        { id: 'e2', source: 'save', sourceHandle: 'default', target: 'answer' },
      ],
    });
    const run = async (mode: ExecutionMode, typeVersion?: number) => {
      const result = await runner.run(
        {
          tenantId: 't',
          workflowId: 'wf',
          workflowName: 'Orders',
          workflowVersion: 1,
          definition: definition(typeVersion),
          trigger: httpTrigger(toWorkflowRequest({ method: 'POST', path: '/orders', auth: { type: 'jwt', id: 'u7' } }), {}),
          shipmentId: null,
          mode,
        },
        { timeoutMs: 5000 },
      );
      if (result.kind !== 'response') throw new Error(JSON.stringify(result));
      return (result.response.body as { order: Record<string, unknown> }).order;
    };

    it('wraps every use of the step: the workspace’s before() first, its after() last', async () => {
      await service.save('t', 'data.insert', { logic: { before: STAMP, after: LAST_WORD } }, null);
      const order = await run('test');
      // The workspace stamped createdBy; the step's own before() ran after it, so its tag wins; the workspace's after() had the last word.
      expect(order).toMatchObject({ createdBy: 'u7', tag: 'step', checkedBy: 'workspace' });
      expect(executions.nodes.get('save')!.output).toMatchObject({ logic: { before: { changed: ['record'] } }, workspaceLogic: { before: { changed: ['record'] }, after: { changed: true } } });
    });

    it('runs the version a published workflow pinned, and nothing where it pinned none', async () => {
      await service.save('t', 'data.insert', { logic: { before: STAMP } }, null);
      expect(await resolver.editVersionToPin('t', 'data.insert')).toBe(1);
      await service.save('t', 'data.insert', { logic: { before: STAMP.replace("'workspace'", "'v2'") } }, null);

      expect(await run('api', 1)).toMatchObject({ createdBy: 'u7' }); // pinned v1 even though v2 exists
      expect(await run('api')).not.toHaveProperty('createdBy'); // published before any workspace logic: unchanged
      await service.reset('t', 'data.insert', null);
      expect(await resolver.editVersionToPin('t', 'data.insert')).toBeUndefined();
      expect(await run('test')).not.toHaveProperty('createdBy'); // drafts follow the latest version: reset
    });
  });
});
