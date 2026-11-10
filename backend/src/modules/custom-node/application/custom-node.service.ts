import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { renderDeep } from '../../../shared/util/path';
import { slugify } from '../../../shared/util/text';
import { requireFound } from '../../../shared/domain/guards';
import { checkCustomNodeCode, runCustomNode } from './custom-node-runner';
import { CodeSandbox } from './code-sandbox.ports';
import { CustomNodeInput } from './custom-node-runner.types';
import { CUSTOM_NODE_TEMPLATES } from './custom-node-templates';
import type { RunnableSpec } from './result-format.types';
import { CUSTOM_TYPE_PREFIX } from '../domain/custom-node.constants';
import { isSimpleFormat, normalizeSpec, specChanged } from '../domain/custom-node';
import { branchIssues, codeIssues, customNodeSpecIssues, resultIssues } from '../domain/custom-node-spec';
import { CustomNode, CustomNodeSpec, CustomNodeVersion } from '../domain/custom-node.types';
import { CustomNodeRepository } from '../domain/custom-node.repository';

@Injectable()
export class CustomNodeService {
  constructor(
    private readonly nodes: CustomNodeRepository,
    private readonly sandbox: CodeSandbox,
  ) {}

  list(tenantId: string, includeArchived = false) {
    return this.nodes.list(tenantId, includeArchived);
  }

  /** Ready-made starting points for the editor. */
  templates() {
    return CUSTOM_NODE_TEMPLATES;
  }

  async get(tenantId: string, id: string) {
    const node = await this.require(tenantId, id);
    return { node, versions: await this.nodes.listVersions(tenantId, id) };
  }

  async getVersion(tenantId: string, id: string, version: number) {
    const node = await this.require(tenantId, id);
    const found = await this.nodes.findVersion(tenantId, node.type, version);
    if (!found) throw new NotFoundError('Custom node version', `${node.type}@${version}`);
    return found;
  }

  /** The version a workflow node should run: the pinned one, else the latest non-archived one. */
  async resolveVersion(tenantId: string, type: string, version?: number): Promise<CustomNodeVersion | null> {
    if (version) return this.nodes.findVersion(tenantId, type, version);
    const node = await this.nodes.findByType(tenantId, type);
    if (!node || node.archived) return null;
    return this.nodes.findVersion(tenantId, type, node.latestVersion);
  }

  async create(tenantId: string, input: CustomNodeSpec): Promise<CustomNode> {
    const spec = await this.validated(input);
    const type = await this.uniqueType(tenantId, slugify(spec.label, { separator: '-', maxLength: 40 }) || 'node');
    const now = new Date().toISOString();
    const node: CustomNode = { ...spec, id: newId('cn'), tenantId, type, latestVersion: 1, archived: false, createdAt: now, updatedAt: now };
    await this.nodes.create(node, { ...spec, customNodeId: node.id, tenantId, type, version: 1, createdAt: now });
    return node;
  }

  /** Saving creates a new version; existing versions never change. No-op when nothing changed. */
  async update(tenantId: string, id: string, input: CustomNodeSpec): Promise<CustomNode> {
    const current = await this.require(tenantId, id);
    if (!specChanged(current, input)) return current;
    const spec = await this.validated(input);
    const now = new Date().toISOString();
    // The spec goes over the identity only, so options the new spec no longer has are dropped.
    const { type, createdAt, archived } = current;
    const node: CustomNode = { ...spec, id, tenantId, type, createdAt, archived, latestVersion: current.latestVersion + 1, updatedAt: now };
    await this.nodes.saveVersion(node, { ...spec, customNodeId: id, tenantId, type, version: node.latestVersion, createdAt: now });
    return node;
  }

  async setArchived(tenantId: string, id: string, archived: boolean) {
    const node = await this.nodes.setArchived(tenantId, id, archived);
    if (!node) throw new NotFoundError('Custom node', id);
    return node;
  }

  /** Runs unsaved code against sample input, exactly as a workflow execution would. */
  async test(spec: RunnableSpec, input: CustomNodeInput) {
    const simple = isSimpleFormat(spec);
    const issues = [...branchIssues(spec.outputs, simple), ...(simple ? resultIssues(spec) : []), ...codeIssues(spec.code)];
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
    const data = { shipment: input.shipment, context: input.context, request: input.request ?? null, trigger: input.trigger };
    return runCustomNode(this.sandbox, spec, { ...input, request: data.request, config: renderDeep(input.config ?? {}, data) });
  }

  /** The normalised spec, or every problem with it (static checks first, then compiling the code). */
  private async validated(input: CustomNodeSpec): Promise<CustomNodeSpec> {
    const spec = normalizeSpec(input);
    const issues = customNodeSpecIssues(spec);
    if (!issues.length) {
      const compiled = await checkCustomNodeCode(this.sandbox, spec);
      if (!compiled.ok) issues.push({ message: `Code: ${compiled.error}` });
    }
    if (issues.length) throw new ValidationFailedError(issues);
    return spec;
  }

  private async uniqueType(tenantId: string, slug: string) {
    for (let n = 1; ; n++) {
      const type = `${CUSTOM_TYPE_PREFIX}${n === 1 ? slug : `${slug}-${n}`}`;
      if (!(await this.nodes.findByType(tenantId, type))) return type;
    }
  }

  private async require(tenantId: string, id: string) {
    return requireFound(await this.nodes.findById(tenantId, id), 'Custom node', id);
  }
}
