import { WorkflowDefinition } from './workflow-definition.types';
import { stepLogicIssues } from '../../nodes/domain/step-logic';
import { isSettingVisible } from '../../nodes/domain/node-config';
import { NodeCatalog } from './workflow-validator.types';
import { ValidationIssue } from '../../../shared/domain/errors.types';

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Structural + semantic validation of a workflow graph. Runs before publish so that a
 * published version is always executable: one trigger, known nodes, valid handles,
 * required config present, everything reachable, and no cycles.
 */
export class WorkflowValidator {
  constructor(private readonly catalog: NodeCatalog) {}

  validate(def: WorkflowDefinition): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const nodes = new Map(def.nodes.map((n) => [n.id, n]));

    if (nodes.size !== def.nodes.length) issues.push({ message: 'Node ids must be unique' });

    const triggers = def.nodes.filter((n) => this.catalog.get(n.type)?.definition.isTrigger);
    if (triggers.length === 0) issues.push({ message: 'Add a trigger node to start the workflow' });
    if (triggers.length > 1) {
      triggers.slice(1).forEach((t) => issues.push({ nodeId: t.id, message: 'Only one trigger is allowed' }));
    }
    if (def.nodes.length - triggers.length === 0) issues.push({ message: 'Add at least one step after the trigger' });

    for (const node of def.nodes) {
      const type = this.catalog.get(node.type, node.typeVersion);
      if (!type) {
        issues.push({
          nodeId: node.id,
          message: node.type.startsWith('custom.')
            ? `"${node.name}" uses a custom node that was archived or no longer exists`
            : `Unknown node type '${node.type}'`,
        });
        continue;
      }
      const schema = type.definition.configSchema;
      for (const field of schema) {
        if (field.required && isSettingVisible(field, node.config ?? {}, schema) && isBlank(node.config?.[field.key])) {
          issues.push({ nodeId: node.id, message: `${node.name || type.definition.label}: "${field.label}" is required` });
        }
      }
      for (const message of [...(type.validateConfig?.(node.config ?? {}) ?? []), ...stepLogicIssues(node.logic, type.definition)]) {
        issues.push({ nodeId: node.id, message: `${node.name || type.definition.label}: ${message}` });
      }
    }

    for (const edge of def.edges) {
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (!source || !target) {
        issues.push({ edgeId: edge.id, message: 'Connection points to a missing node' });
        continue;
      }
      if (edge.source === edge.target) issues.push({ edgeId: edge.id, message: 'A node cannot connect to itself' });
      if (this.catalog.get(target.type)?.definition.isTrigger) {
        issues.push({ edgeId: edge.id, nodeId: target.id, message: 'Triggers cannot have incoming connections' });
      }
      const outputs = this.catalog.get(source.type, source.typeVersion)?.definition.outputs ?? [];
      if (outputs.length && !outputs.some((o) => o.id === (edge.sourceHandle || 'default'))) {
        issues.push({ edgeId: edge.id, nodeId: source.id, message: `Unknown output '${edge.sourceHandle}'` });
      }
    }

    if (triggers.length === 1) {
      const reachable = this.reachableFrom(triggers[0].id, def);
      for (const node of def.nodes) {
        if (!reachable.has(node.id)) {
          issues.push({ nodeId: node.id, message: `"${node.name}" is not connected to the trigger` });
        }
      }
    }

    const cycleNode = this.findCycle(def);
    if (cycleNode) issues.push({ nodeId: cycleNode, message: 'Workflow contains a loop; connections must flow one way' });

    return issues;
  }

  private reachableFrom(start: string, def: WorkflowDefinition): Set<string> {
    const seen = new Set<string>([start]);
    const stack = [start];
    while (stack.length) {
      const current = stack.pop()!;
      for (const edge of def.edges) {
        if (edge.source === current && !seen.has(edge.target)) {
          seen.add(edge.target);
          stack.push(edge.target);
        }
      }
    }
    return seen;
  }

  /** DFS colouring; returns a node on a cycle, if any. */
  private findCycle(def: WorkflowDefinition): string | null {
    const state = new Map<string, 'visiting' | 'done'>();
    const adjacency = new Map<string, string[]>();
    for (const e of def.edges) adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);

    const visit = (id: string): string | null => {
      if (state.get(id) === 'visiting') return id;
      if (state.get(id) === 'done') return null;
      state.set(id, 'visiting');
      for (const next of adjacency.get(id) ?? []) {
        const hit = visit(next);
        if (hit) return hit;
      }
      state.set(id, 'done');
      return null;
    };
    for (const node of def.nodes) {
      const hit = visit(node.id);
      if (hit) return hit;
    }
    return null;
  }
}
