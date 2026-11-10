import { Injectable, Optional } from '@nestjs/common';
import { CustomNodeService } from '../custom-node/application/custom-node.service';
import { isCustomType } from '../custom-node/domain/custom-node';
import { CustomWorkflowNode } from './implementations/custom/custom-workflow-node';
import { customNodeDefinition } from './implementations/custom/custom-node-definition';
import { NodeRegistry } from './node-registry';
import { EventDefinitionService } from '../custom-event/application/event-definition.service';
import { CodeSandbox } from '../custom-node/application/code-sandbox.ports';
import { NodeTypeDefinition, TriggerKind, WorkflowNode } from './domain/workflow-node.types';
import { PINNED_CACHE_LIMIT } from './node-resolver.constants';
import { LogicStep, WORKSPACE_SCOPE } from './logic-step';
import { BuiltinNodeEditRepository } from '../builtin-node/domain/builtin-node-edit.repository';
import { EDIT_CACHE_LIMIT } from '../builtin-node/domain/builtin-node-edit.constants';
import { appliedEdit, hasChanges } from './domain/builtin-node-edit';
import { hasStepLogic, noLogicReason } from './domain/step-logic';
import type { StepLogic, WorkflowDefinition, WorkflowNodeDef } from '../workflow/domain/workflow-definition.types';
import type { NodeCatalog } from '../workflow/domain/workflow-validator.types';
import type { ExecutionMode } from '../execution/domain/execution.types';

/**
 * One place that answers "what implements node type X for tenant T?". Built-in types come from
 * the static registry (with the workspace's changes from the Nodes page); `custom.*` types are loaded
 * per tenant at a specific version.
 */
@Injectable()
export class NodeResolver {
  // Pinned versions never change, so they can be cached indefinitely (bounded in size).
  private readonly pinned = new Map<string, CustomWorkflowNode>();
  private readonly pinnedLogic = new Map<string, StepLogic | null>();

  constructor(
    readonly registry: NodeRegistry,
    private readonly customNodes: CustomNodeService,
    private readonly sandbox: CodeSandbox,
    private readonly events: EventDefinitionService,
    // Absent in tests that don't need workspace changes to built-in steps.
    @Optional() private readonly edits?: BuiltinNodeEditRepository,
  ) {}

  isTrigger(type: string): boolean {
    return !!this.registry.get(type)?.definition.isTrigger;
  }

  /** The trigger node of a definition with its implementation (triggers are always built-in). */
  triggerOf(definition: WorkflowDefinition): { node: WorkflowNodeDef; impl: WorkflowNode; kind: TriggerKind } | undefined {
    const node = definition.nodes.find((n) => this.isTrigger(n.type));
    const impl = node && this.registry.get(node.type);
    if (!node || !impl) return undefined;
    return { node, impl, kind: impl.definition.triggerKind ?? 'event' };
  }

  /** What a published workflow subscribes to: the trigger's key (event name, `http.request`, `schedule`). */
  triggerKeyOf(definition: WorkflowDefinition): string | null {
    const trigger = this.triggerOf(definition);
    if (!trigger) return null;
    return trigger.impl.triggerKey?.(trigger.node.config ?? {}) ?? String(trigger.node.config?.event ?? '');
  }

  async resolve(tenantId: string, type: string, version?: number): Promise<WorkflowNode | undefined> {
    if (!isCustomType(type)) return this.registry.get(type);
    const key = version ? `${tenantId}:${type}@${version}` : null;
    if (key && this.pinned.has(key)) return this.pinned.get(key);

    const found = await this.customNodes.resolveVersion(tenantId, type, version);
    if (!found) return undefined;
    const node = new CustomWorkflowNode(found, this.sandbox, this.events);
    if (key) {
      if (this.pinned.size >= PINNED_CACHE_LIMIT) this.pinned.delete(this.pinned.keys().next().value!);
      this.pinned.set(key, node);
    }
    return node;
  }

  /** The step as the run executes it: wrapped in the workspace's own logic when it has some. */
  withLogic(impl: WorkflowNode, logic: StepLogic | undefined): WorkflowNode {
    return hasStepLogic(logic) ? new LogicStep(impl, logic, this.sandbox) : impl;
  }

  /**
   * The step with its own logic, inside the workspace logic of its built-in type (Nodes page): the
   * workspace's before() runs first and its after() last, around every use of the step.
   */
  async withLogics(tenantId: string, impl: WorkflowNode, node: WorkflowNodeDef, mode: ExecutionMode): Promise<WorkflowNode> {
    const own = this.withLogic(impl, node.logic);
    const workspace = await this.workspaceLogicFor(tenantId, node, mode);
    return workspace && noLogicReason(impl.definition) === null ? new LogicStep(own, workspace, this.sandbox, WORKSPACE_SCOPE) : own;
  }

  /**
   * Which workspace logic a step runs: the version pinned when its workflow was published, or the
   * latest in test runs of drafts. A published version pinned nothing when there was no workspace
   * logic then — so later changes on the Nodes page never alter what a published version does.
   */
  private async workspaceLogicFor(tenantId: string, node: WorkflowNodeDef, mode: ExecutionMode): Promise<StepLogic | null> {
    if (!this.edits || isCustomType(node.type) || !this.registry.get(node.type)) return null;
    if (!node.typeVersion) {
      if (mode !== 'test') return null;
      const latest = await this.edits.latest(tenantId, node.type);
      return latest && hasChanges(latest) && hasStepLogic(latest.logic) ? latest.logic : null;
    }
    const key = `${tenantId}:${node.type}@${node.typeVersion}`;
    if (!this.pinnedLogic.has(key)) {
      const edit = await this.edits.find(tenantId, node.type, node.typeVersion);
      if (this.pinnedLogic.size >= EDIT_CACHE_LIMIT) this.pinnedLogic.delete(this.pinnedLogic.keys().next().value!);
      this.pinnedLogic.set(key, edit && !edit.reset && hasStepLogic(edit.logic) ? edit.logic : null);
    }
    return this.pinnedLogic.get(key) ?? null;
  }

  /** The workspace-logic version a built-in step should pin when its workflow publishes (none without logic). */
  async editVersionToPin(tenantId: string, type: string): Promise<number | undefined> {
    if (!this.edits || isCustomType(type) || !this.registry.get(type)) return undefined;
    const latest = await this.edits.latest(tenantId, type);
    return latest && hasChanges(latest) && hasStepLogic(latest.logic) ? latest.version : undefined;
  }

  /** Palette contents for a tenant: built-ins plus the latest version of each active custom node. */
  async catalog(tenantId: string): Promise<NodeTypeDefinition[]> {
    const custom = await this.customNodes.list(tenantId);
    const edits = new Map((this.edits ? await this.edits.latestAll(tenantId) : []).map((e) => [e.type, e]));
    return [
      ...this.registry.catalog().map((def) => appliedEdit(def, edits.get(def.type))),
      ...custom.map((c) => customNodeDefinition(c, { id: c.id, version: c.latestVersion })),
    ];
  }

  /** Resolves every node type a definition uses up front, so the validator can stay synchronous. */
  async catalogFor(tenantId: string, definition: WorkflowDefinition): Promise<NodeCatalog> {
    const resolved = new Map<string, WorkflowNode | undefined>();
    for (const node of definition.nodes) {
      const key = `${node.type}@${node.typeVersion ?? 'latest'}`;
      if (!resolved.has(key)) resolved.set(key, await this.resolve(tenantId, node.type, node.typeVersion));
    }
    return {
      get: (type: string, version?: number) => resolved.get(`${type}@${version ?? 'latest'}`) ?? this.registry.get(type),
    };
  }
}
