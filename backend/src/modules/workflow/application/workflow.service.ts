import { Inject, Injectable } from '@nestjs/common';
import { Workflow, WorkflowVersion } from '../domain/workflow.entity';
import { WorkflowRepository, WorkflowVersionRepository } from '../domain/workflow.repository';
import { WorkflowValidator } from '../domain/workflow-validator';
import { unpinCustomNodes, withoutEmptyLogic } from '../domain/workflow-definition';
import { CreateWorkflowInput, DuplicateWorkflowInput, WorkflowMeta } from './workflow.service.types';
import { referencedValues } from '../domain/reference-checker';
import { NodeResolver } from '../../nodes/node-resolver';
import { isCustomType } from '../../custom-node/domain/custom-node';
import { InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { BLANK_DEFINITION, WORKFLOW_TEMPLATES } from './workflow-templates';
import { withPartIds } from './workflow-templates.helpers';
import type { CreatedPart } from './workflow-templates.types';
import { REFERENCE_CHECKERS } from '../domain/reference-checker.constants';
import { ReferenceChecker } from '../domain/reference-checker.types';
import { WorkflowDefinition } from '../domain/workflow-definition.types';
import { WORKFLOW_EVENTS } from '../domain/workflow-events.constants';
import { WorkflowArchivedPayload, WorkflowPublishedPayload } from '../domain/workflow-events.types';
import { ValidationIssue } from '../../../shared/domain/errors.types';
import { DomainEventPublisher } from '../../../shared/events/domain-events.ports';
import { requireFound } from '../../../shared/domain/guards';
import { domainEvent } from '../../../shared/events/domain-event.factory';
import { WorkflowPausedError } from '../domain/workflow.errors';

/**
 * Use cases for authoring workflows. Publishing freezes a version: later edits create a new
 * draft, and running executions keep using the version they started with.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly versions: WorkflowVersionRepository,
    private readonly resolver: NodeResolver,
    @Inject(REFERENCE_CHECKERS) private readonly checkers: ReferenceChecker[],
    private readonly events: DomainEventPublisher,
  ) {}

  templates() {
    return WORKFLOW_TEMPLATES.map(({ id, name, description }) => ({ id, name, description }));
  }

  /**
   * A new workflow (v1 draft), from a template or blank. A template's parts — the workflows its Run
   * workflow steps call — are created with it as drafts named "<name> · <part>", and its steps point at
   * them. Nothing is published: publishing stays a deliberate step (and a separate permission).
   */
  async create(tenantId: string, input: CreateWorkflowInput) {
    const template = input.templateId ? WORKFLOW_TEMPLATES.find((t) => t.id === input.templateId) : undefined;
    if (input.templateId && !template) throw new NotFoundError('Template', input.templateId);
    const parts: CreatedPart[] = [];
    for (const part of template?.parts ?? []) {
      const name = `${input.name} · ${part.name}`;
      const created = await this.createWithDefinition(tenantId, { name, description: part.description }, structuredClone(part.definition));
      parts.push({ key: part.key, id: created.workflow.id, name });
    }
    const created = await this.createWithDefinition(
      tenantId,
      { name: input.name, description: input.description ?? template?.description },
      withPartIds(structuredClone(template?.definition ?? BLANK_DEFINITION()), parts),
    );
    return { ...created, parts };
  }

  /**
   * Copies a workflow into a new, independent draft workflow under another name. The copy starts
   * at v1, is not published, and has no endpoints or schedules bound to it.
   */
  async duplicate(tenantId: string, id: string, input: DuplicateWorkflowInput) {
    const { workflow, version } = await this.resolveWorkingVersion(tenantId, id, input.version);
    const source = workflow.toJSON();
    const name = input.name.trim();
    if (name.toLowerCase() === source.name.trim().toLowerCase()) {
      throw new ValidationFailedError([{ message: `Choose a name different from “${source.name}”` }]);
    }
    return this.createWithDefinition(
      tenantId,
      { name, description: input.description ?? source.description },
      unpinCustomNodes(structuredClone(version.definition)),
    );
  }

  async list(tenantId: string) {
    return (await this.workflows.list(tenantId)).map((w) => w.toJSON());
  }

  async get(tenantId: string, id: string) {
    const workflow = await this.require(tenantId, id);
    const [summaries, draft, published] = await Promise.all([
      this.versions.listSummaries(tenantId, id),
      this.versions.findDraft(tenantId, id),
      workflow.publishedVersion ? this.versions.find(tenantId, id, workflow.publishedVersion) : null,
    ]);
    return {
      workflow: workflow.toJSON(),
      versions: summaries.map((v) => {
        const { definition, ...summary } = v.toJSON();
        return summary;
      }),
      draft: draft?.toJSON() ?? null,
      published: published?.toJSON() ?? null,
    };
  }

  async getVersion(tenantId: string, id: string, version: number): Promise<WorkflowVersion> {
    const found = await this.versions.find(tenantId, id, version);
    if (!found) throw new NotFoundError('Workflow version', `${id}@${version}`);
    return found;
  }

  async saveDraft(tenantId: string, id: string, input: WorkflowDefinition) {
    const workflow = await this.require(tenantId, id);
    const definition = withoutEmptyLogic(unpinCustomNodes(input));
    let draft = await this.versions.findDraft(tenantId, id);
    if (!draft) {
      draft = WorkflowVersion.draft({
        id: newId('wfv'),
        tenantId,
        workflowId: id,
        version: workflow.nextVersion(),
        definition,
      });
      await this.workflows.save(workflow);
    } else {
      draft.updateDefinition(definition);
    }
    await this.versions.save(draft);
    return draft.toJSON();
  }

  async validate(tenantId: string, definition: WorkflowDefinition) {
    const catalog = await this.resolver.catalogFor(tenantId, definition);
    const errors = new WorkflowValidator(catalog).validate(definition);
    // Settings that point at other resources (events, collections…) must point at ones that exist.
    for (const node of definition.nodes) {
      const fields = catalog.get(node.type, node.typeVersion)?.definition.configSchema ?? [];
      for (const field of fields) {
        const checker = field.optionsSource && this.checkers.find((c) => c.sources.includes(field.optionsSource!));
        if (!checker) continue;
        for (const value of referencedValues(node.config?.[field.key])) {
          const problem = await checker.check(tenantId, value, field);
          if (problem) errors.push({ nodeId: node.id, message: `"${node.name}": ${problem}` } satisfies ValidationIssue);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(tenantId: string, id: string) {
    const workflow = await this.require(tenantId, id);
    const draft = await this.versions.findDraft(tenantId, id);
    if (!draft) throw new InvalidOperationError('There is no draft to publish');

    // Freeze the custom node logic this version runs, so later edits to a node can't change it.
    const definition = await this.pinCustomNodes(tenantId, draft.definition);
    const { errors } = await this.validate(tenantId, definition);
    if (errors.length) throw new ValidationFailedError(errors);
    draft.updateDefinition(definition);

    const trigger = this.resolver.triggerOf(definition)!;
    const triggerEvent = this.resolver.triggerKeyOf(definition)!;
    if (workflow.publishedVersion) {
      const previous = await this.versions.find(tenantId, id, workflow.publishedVersion);
      if (previous) {
        previous.supersede();
        await this.versions.save(previous);
      }
    }
    draft.publish();
    workflow.markPublished(draft.version, triggerEvent);
    await this.versions.save(draft);
    await this.workflows.save(workflow);
    await this.announce<WorkflowPublishedPayload>(tenantId, WORKFLOW_EVENTS.published, {
      workflowId: id,
      version: draft.version,
      triggerEvent,
      triggerConfig: trigger.node.config ?? {},
    });
    return draft.toJSON();
  }

  /**
   * Freezes what a version runs: each custom node at its latest version, and each built-in step at its
   * workspace-logic version (Nodes page), if it has one — later edits never change a published version.
   */
  private async pinCustomNodes(tenantId: string, definition: WorkflowDefinition): Promise<WorkflowDefinition> {
    const nodes = await Promise.all(
      definition.nodes.map(async (node) => {
        if (!isCustomType(node.type)) {
          const version = await this.resolver.editVersionToPin(tenantId, node.type);
          return version ? { ...node, typeVersion: version } : node;
        }
        const latest = await this.resolver.resolve(tenantId, node.type);
        return latest?.definition.custom ? { ...node, typeVersion: latest.definition.custom.version } : node;
      }),
    );
    return { ...definition, nodes };
  }

  async archive(tenantId: string, id: string) {
    const workflow = await this.require(tenantId, id);
    workflow.archive();
    await this.workflows.save(workflow);
    await this.announce<WorkflowArchivedPayload>(tenantId, WORKFLOW_EVENTS.archived, { workflowId: id });
  }

  /**
   * Pauses a published workflow: its endpoints answer 503, schedules, events and record changes skip
   * it, and Run workflow steps calling it fail — until it is resumed. Runs already going finish; test
   * runs in the builder still work.
   */
  async pause(tenantId: string, id: string) {
    const workflow = await this.require(tenantId, id);
    workflow.pause();
    await this.workflows.save(workflow);
    return workflow.toJSON();
  }

  /** Lets every trigger start the workflow again (its published version, as it is now). */
  async resume(tenantId: string, id: string) {
    const workflow = await this.require(tenantId, id);
    workflow.resume();
    await this.workflows.save(workflow);
    return workflow.toJSON();
  }

  private announce<T>(tenantId: string, name: string, payload: T) {
    return this.events.publish(domainEvent(name, tenantId, payload));
  }

  /** The version people work on (test runs, copies): an explicit one, else the draft, else the published one. */
  async resolveWorkingVersion(tenantId: string, id: string, version?: number) {
    const workflow = await this.require(tenantId, id);
    if (version) return { workflow, version: await this.getVersion(tenantId, id, version) };
    const draft = await this.versions.findDraft(tenantId, id);
    if (draft) return { workflow, version: draft };
    if (workflow.publishedVersion) {
      return { workflow, version: await this.getVersion(tenantId, id, workflow.publishedVersion) };
    }
    throw new InvalidOperationError('Workflow has no runnable version');
  }

  /** The live (published) version of a workflow; fails if it has never been published, or is paused (WorkflowPausedError). */
  async resolvePublished(tenantId: string, id: string) {
    const workflow = await this.require(tenantId, id);
    if (!workflow.publishedVersion) throw new InvalidOperationError(`Workflow "${workflow.name}" is not published`);
    if (workflow.isPaused) throw new WorkflowPausedError(workflow.name);
    return { workflow, version: await this.getVersion(tenantId, id, workflow.publishedVersion) };
  }

  findPublishedByTrigger(tenantId: string, event: string) {
    return this.workflows.findPublishedByTrigger(tenantId, event);
  }

  /** Workspaces with a published workflow whose trigger key starts with `prefix` (e.g. record:). */
  tenantsWithTriggerPrefix(prefix: string) {
    return this.workflows.tenantsWithTriggerPrefix(prefix);
  }

  count(tenantId: string, filter?: { status?: string }) {
    return this.workflows.count(tenantId, filter);
  }

  /** A new workflow with `definition` as its v1 draft. */
  private async createWithDefinition(tenantId: string, meta: WorkflowMeta, definition: WorkflowDefinition) {
    const workflow = Workflow.create({ id: newId('wf'), tenantId, name: meta.name, description: meta.description });
    const version = WorkflowVersion.draft({ id: newId('wfv'), tenantId, workflowId: workflow.id, version: 1, definition });
    await this.workflows.save(workflow);
    await this.versions.save(version);
    return { workflow: workflow.toJSON(), version: version.toJSON() };
  }

  private async require(tenantId: string, id: string): Promise<Workflow> {
    const workflow = await this.workflows.findById(tenantId, id);
    return requireFound(workflow?.isArchived ? null : workflow, 'Workflow', id);
  }
}
