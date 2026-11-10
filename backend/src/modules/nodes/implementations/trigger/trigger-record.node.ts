import { Injectable } from '@nestjs/common';
import { COLLECTION_NAME } from '../../../data/domain/data-collection.constants';
import { parseFilter } from '../../../../shared/query/record-query';
import { jsonSettingErrors } from '../../../../shared/util/json-setting';
import { RECORD_OPERATIONS, RECORD_TRIGGER_PREFIX } from '../../domain/triggers.constants';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import type { NodeExecutionContext, NodeExecutionResult, NodeTypeDefinition, WorkflowNode } from '../../domain/workflow-node.types';

const OPERATION_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'deleted', label: 'Deleted' },
];

/**
 * Starts the workflow when a record of a collection is created, updated or deleted — by a workflow,
 * the API, the Data page or any other tool (MongoDB change streams). The run reads the change as
 * {{trigger.data.record}}, {{trigger.data.previous}} (before an update or delete),
 * {{trigger.data.operation}} and {{trigger.data.changedFields}}.
 */
@Injectable()
export class TriggerRecordNode implements WorkflowNode {
  readonly definition: NodeTypeDefinition = {
    type: 'trigger.record',
    category: 'trigger',
    label: 'Record changed',
    description: 'Starts the workflow when a record of a collection is created, updated or deleted — whoever changed it.',
    icon: 'database-zap',
    isTrigger: true,
    triggerKind: 'record',
    configSchema: [
      { key: 'collection', label: 'Collection', kind: 'select', optionsSource: 'collections', required: true, help: 'A collection on the Data page' },
      {
        key: 'operations',
        label: 'When a record is',
        kind: 'multiselect',
        options: OPERATION_OPTIONS,
        default: ['created', 'updated', 'deleted'],
        help: 'Leave all three on to react to any change.',
      },
      {
        key: 'fields',
        label: 'Only when these fields change',
        kind: 'text',
        placeholder: 'status, balance',
        help: 'Updates only: comma-separated. Empty: any change. Use it to avoid running again on a write this workflow makes itself.',
      },
      {
        key: 'filter',
        label: 'Only records matching',
        kind: 'json',
        placeholder: '{"status": "paid"}',
        help: 'The record (after the change; before it, for a delete) must match this filter.',
      },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = jsonSettingErrors(config, [{ key: 'filter', label: 'Only records matching' }]);
    const collection = String(config.collection ?? '');
    if (!COLLECTION_NAME.test(collection)) errors.push('Choose the collection to watch');
    const operations = config.operations;
    if (operations !== undefined && (!Array.isArray(operations) || !operations.length || operations.some((o) => !(RECORD_OPERATIONS as readonly unknown[]).includes(o)))) {
      errors.push('“When a record is” needs at least one of created, updated, deleted');
    }
    if (!errors.length && config.filter) {
      try {
        parseFilter(typeof config.filter === 'string' ? JSON.parse(config.filter) : config.filter);
      } catch (error) {
        errors.push(`Only records matching: ${(error as Error).message}`);
      }
    }
    return errors;
  }

  triggerKey(config: Record<string, unknown>): string {
    return `${RECORD_TRIGGER_PREFIX}${String(config.collection ?? '')}`;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const change = (ctx.data.trigger.data ?? {}) as Record<string, unknown>;
    return {
      outputHandle: 'default',
      output: { collection: change.collection, operation: change.operation, recordId: change.recordId, changedFields: change.changedFields ?? null },
    };
  }
}
