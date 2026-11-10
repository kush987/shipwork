import { WorkflowService } from './workflow.service';
import { Workflow, WorkflowVersion } from '../domain/workflow.entity';
import { WorkflowRepository, WorkflowVersionRepository } from '../domain/workflow.repository';
import type { NodeResolver } from '../../nodes/node-resolver';
import type { DomainEventPublisher } from '../../../shared/events/domain-events.ports';
import { InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { WorkflowPausedError } from '../domain/workflow.errors';
import type { WorkflowDefinition } from '../domain/workflow-definition.types';

class InMemoryWorkflows extends WorkflowRepository {
  items = new Map<string, Workflow>();
  async save(w: Workflow) {
    this.items.set(w.id, Workflow.restore(w.toJSON()));
  }
  async findById(tenantId: string, id: string) {
    const w = this.items.get(id);
    return w && w.tenantId === tenantId ? Workflow.restore(w.toJSON()) : null;
  }
  async list(tenantId: string) {
    return [...this.items.values()].filter((w) => w.tenantId === tenantId && !w.isArchived);
  }
  async findPublishedByTrigger() {
    return [];
  }
  async tenantsWithTriggerPrefix() {
    return [];
  }
  async count() {
    return this.items.size;
  }
}

class InMemoryVersions extends WorkflowVersionRepository {
  items = new Map<string, WorkflowVersion>();
  async save(v: WorkflowVersion) {
    this.items.set(v.toJSON().id, WorkflowVersion.restore(structuredClone(v.toJSON())));
  }
  private all(tenantId: string, workflowId: string) {
    return [...this.items.values()].filter((v) => v.toJSON().tenantId === tenantId && v.toJSON().workflowId === workflowId);
  }
  async find(tenantId: string, workflowId: string, version: number) {
    return this.all(tenantId, workflowId).find((v) => v.version === version) ?? null;
  }
  async findDraft(tenantId: string, workflowId: string) {
    return this.all(tenantId, workflowId).find((v) => v.status === 'draft') ?? null;
  }
  async listSummaries(tenantId: string, workflowId: string) {
    return this.all(tenantId, workflowId);
  }
}

const def = (label: string): WorkflowDefinition => ({
  nodes: [
    { id: 'trigger', type: 'trigger.http', name: 'API request', position: { x: 0, y: 0 }, config: {} },
    { id: 'risk', type: 'custom.risk', name: label, position: { x: 300, y: 0 }, config: { threshold: 2000 }, typeVersion: 3 },
  ],
  edges: [{ id: 'e1', source: 'trigger', sourceHandle: 'default', target: 'risk' }],
});

describe('WorkflowService.duplicate', () => {
  let workflows: InMemoryWorkflows;
  let versions: InMemoryVersions;
  let service: WorkflowService;

  /** A workflow with v1 published (`def('v1')`) and a v2 draft (`def('v2')`). */
  const sourceWorkflow = async () => {
    const { workflow } = await service.create('t', { name: 'Create order', description: 'Places orders' });
    const v1 = (await versions.findDraft('t', workflow.id))!;
    v1.updateDefinition(def('v1'));
    v1.publish();
    await versions.save(v1);
    const stored = (await workflows.findById('t', workflow.id))!;
    stored.markPublished(1, 'http.request');
    await workflows.save(stored);
    await service.saveDraft('t', workflow.id, def('v2'));
    return workflow.id;
  };

  beforeEach(() => {
    workflows = new InMemoryWorkflows();
    versions = new InMemoryVersions();
    service = new WorkflowService(workflows, versions, {} as NodeResolver, [], { publish: jest.fn() } as unknown as DomainEventPublisher);
  });

  it('copies the working draft into a new, unpublished v1 draft with the new name', async () => {
    const id = await sourceWorkflow();
    const copy = await service.duplicate('t', id, { name: '  Create order (EU) ' });

    expect(copy.workflow).toMatchObject({ name: 'Create order (EU)', description: 'Places orders', status: 'draft', publishedVersion: null, latestVersion: 1 });
    expect(copy.workflow.id).not.toBe(id);
    expect(copy.version).toMatchObject({ workflowId: copy.workflow.id, version: 1, status: 'draft' });
    expect(copy.version.definition.nodes.map((n) => n.name)).toEqual(['API request', 'v2']);
    // Drafts run the latest custom node version; the copy must not keep the source's pin.
    expect(copy.version.definition.nodes[1].typeVersion).toBeUndefined();
  });

  it('can copy a specific version and leaves the source untouched', async () => {
    const id = await sourceWorkflow();
    const copy = await service.duplicate('t', id, { name: 'Old flow', description: 'From v1', version: 1 });
    expect(copy.workflow.description).toBe('From v1');
    expect(copy.version.definition.nodes[1].name).toBe('v1');

    copy.version.definition.nodes[1].name = 'changed';
    expect((await versions.find('t', id, 1))!.definition.nodes[1].name).toBe('v1');
    expect((await workflows.findById('t', id))!.toJSON()).toMatchObject({ name: 'Create order', publishedVersion: 1, latestVersion: 2 });
  });

  it('requires a different name and an existing, active source', async () => {
    const id = await sourceWorkflow();
    await expect(service.duplicate('t', id, { name: 'create ORDER ' })).rejects.toBeInstanceOf(ValidationFailedError);
    await expect(service.duplicate('t', id, { name: 'Copy', version: 9 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.duplicate('other-tenant', id, { name: 'Copy' })).rejects.toBeInstanceOf(NotFoundError);
    await service.archive('t', id);
    await expect(service.duplicate('t', id, { name: 'Copy' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('WorkflowService.create from a template with parts', () => {
  let workflows: InMemoryWorkflows;
  let versions: InMemoryVersions;
  let service: WorkflowService;

  beforeEach(() => {
    workflows = new InMemoryWorkflows();
    versions = new InMemoryVersions();
    service = new WorkflowService(workflows, versions, {} as NodeResolver, [], { publish: jest.fn() } as unknown as DomainEventPublisher);
  });

  it('creates the workflows its Run workflow steps call, as drafts, and points the steps at them', async () => {
    const created = await service.create('t', { name: 'Checkout', templateId: 'api-checkout' });
    expect(created.parts.map((p) => p.name)).toEqual(['Checkout · Price order', 'Checkout · Reserve stock']);
    expect([...workflows.items.values()].map((w) => [w.toJSON().name, w.toJSON().status])).toEqual([
      ['Checkout · Price order', 'draft'],
      ['Checkout · Reserve stock', 'draft'],
      ['Checkout', 'draft'],
    ]);
    const steps = created.version.definition.nodes.filter((n) => n.type === 'flow.run_workflow');
    expect(steps.map((n) => n.config.workflowId)).toEqual(created.parts.map((p) => p.id));
    const price = (await versions.findDraft('t', created.parts[0].id))!.toJSON().definition;
    expect(price.nodes.map((n) => n.type)).toContain('code.run');
  });

  it('creates nothing else for a template without parts, or a blank workflow', async () => {
    expect((await service.create('t', { name: 'Orders', templateId: 'api-create-order' })).parts).toEqual([]);
    expect((await service.create('t', { name: 'Blank' })).parts).toEqual([]);
    expect(workflows.items.size).toBe(2);
  });
});

describe('WorkflowService.pause / resume', () => {
  let workflows: InMemoryWorkflows;
  let versions: InMemoryVersions;
  let service: WorkflowService;

  const published = async () => {
    const { workflow } = await service.create('t', { name: 'Create order' });
    const v1 = (await versions.findDraft('t', workflow.id))!;
    v1.updateDefinition(def('v1'));
    v1.publish();
    await versions.save(v1);
    const stored = (await workflows.findById('t', workflow.id))!;
    stored.markPublished(1, 'http.request');
    await workflows.save(stored);
    return workflow.id;
  };

  beforeEach(() => {
    workflows = new InMemoryWorkflows();
    versions = new InMemoryVersions();
    service = new WorkflowService(workflows, versions, {} as NodeResolver, [], { publish: jest.fn() } as unknown as DomainEventPublisher);
  });

  it('a paused workflow keeps its published version but can’t be run until it is resumed', async () => {
    const id = await published();
    const paused = await service.pause('t', id);
    expect(paused).toMatchObject({ status: 'published', publishedVersion: 1, paused: true, pausedAt: expect.any(Date) });
    await expect(service.resolvePublished('t', id)).rejects.toThrow(new WorkflowPausedError('Create order'));
    // Test runs and copies still use it.
    expect((await service.resolveWorkingVersion('t', id)).version.version).toBe(1);

    expect(await service.pause('t', id)).toMatchObject({ paused: true }); // pausing twice changes nothing
    expect(await service.resume('t', id)).toMatchObject({ paused: false, pausedAt: null });
    expect((await service.resolvePublished('t', id)).version.version).toBe(1);
  });

  it('only a published, active workflow can be paused', async () => {
    const { workflow } = await service.create('t', { name: 'Draft only' });
    await expect(service.pause('t', workflow.id)).rejects.toThrow('Only a published workflow can be paused');
    const id = await published();
    await service.archive('t', id);
    await expect(service.pause('t', id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('publishing a new version keeps it paused', () => {
    const w = Workflow.create({ id: 'wf', tenantId: 't', name: 'Flow' });
    w.markPublished(1, 'http.request');
    w.pause();
    w.markPublished(2, 'http.request');
    expect(w.toJSON()).toMatchObject({ publishedVersion: 2, paused: true });
    w.archive();
    expect(() => w.resume()).toThrow(InvalidOperationError);
  });
});
