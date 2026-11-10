import type { NodeTypeDefinition } from '../../nodes/domain/workflow-node.types';

/** What the validator needs to know about node types — satisfied by NodeRegistry. */
export interface NodeCatalog {
  get(
    type: string,
    version?: number,
  ): { definition: NodeTypeDefinition; validateConfig?(config: Record<string, unknown>): string[] } | undefined;
}
