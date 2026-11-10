import { PART_REF_PREFIX } from './workflow-templates.constants';
import type { WorkflowDefinition } from '../domain/workflow-definition.types';
import type { CreatedPart } from './workflow-templates.types';

/** Where a template's Run workflow step points before its part exists: replaced with the part's id on create. */
export const partRef = (key: string) => `${PART_REF_PREFIX}${key}`;

/** Points every step that refers to a part (`workflowId: partRef(key)`) at the workflow created for it. */
export function withPartIds(definition: WorkflowDefinition, parts: CreatedPart[]): WorkflowDefinition {
  const ids = new Map(parts.map((p) => [partRef(p.key), p.id]));
  return {
    ...definition,
    nodes: definition.nodes.map((node) => {
      const ref = node.config?.workflowId;
      if (typeof ref !== 'string' || !ref.startsWith(PART_REF_PREFIX)) return node;
      const id = ids.get(ref);
      if (!id) throw new Error(`Template step "${node.name}" refers to a part "${ref}" the template doesn't define`);
      return { ...node, config: { ...node.config, workflowId: id } };
    }),
  };
}
