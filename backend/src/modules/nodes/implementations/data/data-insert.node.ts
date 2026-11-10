import { Injectable } from '@nestjs/common';
import { collectionField, saveAsField, saveAsKey } from '../../domain/node-config';
import { DataNode } from './data-node.base';
import { TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { FAILED_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult } from '../../domain/workflow-node.types';

@Injectable()
export class DataInsertNode extends DataNode {
  protected readonly jsonSettings = [{ key: 'record', label: 'Record' }];

  readonly definition = {
    type: 'data.insert',
    category: 'data' as const,
    label: 'Create record',
    description: 'Creates a record (checked against the collection’s fields) and saves it, including its new id.',
    icon: 'file-plus',
    configSchema: [
      collectionField,
      {
        key: 'record',
        label: 'Record',
        kind: 'json' as const,
        required: true,
        default: '{"customerId": "{{request.body.customerId}}", "status": "CREATED"}',
        help: TYPED_JSON_HELP,
      },
      saveAsField('record'),
    ],
    // Failed: e.g. a duplicate value of a unique field, or a record that doesn't fit the collection.
    outputs: [{ id: 'default', label: 'Created' }, FAILED_OUTPUT],
  };

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const record = await this.data.createRecord(ctx.tenantId, collection, this.jsonObject(ctx, 'record', 'Record'));
    const saveAs = saveAsKey(ctx.config, 'record');
    return { outputHandle: 'default', output: { collection, savedAs: `context.${saveAs}`, record }, contextPatch: { [saveAs]: record } };
  }
}
