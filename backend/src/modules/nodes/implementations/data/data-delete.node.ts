import { Injectable } from '@nestjs/common';
import { collectionField } from '../../domain/node-config';
import { DataNode, recordIdField } from './data-node.base';
import { NodeExecutionContext, NodeExecutionResult } from '../../domain/workflow-node.types';

@Injectable()
export class DataDeleteNode extends DataNode {
  readonly definition = {
    type: 'data.delete',
    category: 'data' as const,
    label: 'Delete record',
    description: 'Deletes one record by id.',
    icon: 'file-x',
    configSchema: [collectionField, recordIdField],
    outputs: [
      { id: 'deleted', label: 'Deleted' },
      { id: 'not_found', label: 'Not found' },
    ],
  };

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const id = this.recordId(ctx);
    const deleted = await this.data.deleteRecord(ctx.tenantId, collection, id);
    return { outputHandle: deleted ? 'deleted' : 'not_found', output: { collection, id, deleted } };
  }
}
