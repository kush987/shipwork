import { Inject, Injectable } from '@nestjs/common';
import { NodeTypeDefinition, WorkflowNode } from './domain/workflow-node.types';
import { WORKFLOW_NODES } from './domain/workflow-node.constants';

@Injectable()
export class NodeRegistry {
  private readonly nodes = new Map<string, WorkflowNode>();

  constructor(@Inject(WORKFLOW_NODES) nodes: WorkflowNode[]) {
    for (const node of nodes) {
      if (this.nodes.has(node.definition.type)) {
        throw new Error(`Duplicate node type registered: ${node.definition.type}`);
      }
      this.nodes.set(node.definition.type, node);
    }
  }

  get(type: string): WorkflowNode | undefined {
    return this.nodes.get(type);
  }

  catalog(): NodeTypeDefinition[] {
    return [...this.nodes.values()].map((n) => n.definition);
  }
}
