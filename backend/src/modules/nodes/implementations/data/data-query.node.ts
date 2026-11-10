import { Injectable } from '@nestjs/common';
import { dataSourceField, saveAsField, saveAsKey } from '../../domain/node-config';
import { DataNode, joinsField, LIST_JSON_SETTINGS, recordFieldsField, recordFilterField, recordSortField } from './data-node.base';
import { MAX_LIMIT } from '../../../../shared/query/record-query.constants';
import { NodeExecutionContext, NodeExecutionResult } from '../../domain/workflow-node.types';

@Injectable()
export class DataQueryNode extends DataNode {
  protected readonly readsBuiltIn = true;
  protected readonly jsonSettings = LIST_JSON_SETTINGS;

  readonly definition = {
    type: 'data.query',
    category: 'data' as const,
    label: 'Find records',
    description:
      'Finds records in a collection or built-in data (shipments, warehouses, couriers) by a filter and saves them as a list — with related records from other data joined in.',
    icon: 'search',
    configSchema: [
      dataSourceField,
      recordFilterField,
      recordSortField,
      { key: 'limit', label: 'Limit', kind: 'number' as const, default: 20, help: `1–${MAX_LIMIT}` },
      recordFieldsField,
      joinsField,
      saveAsField('records'),
    ],
    outputs: [
      { id: 'found', label: 'Found' },
      { id: 'empty', label: 'None' },
    ],
  };

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const sort = this.jsonObject(ctx, 'sort', 'Sort');
    const found = await this.sources.findRecords(ctx.tenantId, collection, {
      filter: this.jsonObject(ctx, 'filter', 'Filter'),
      sort,
      limit: Number(ctx.config.limit) || 20,
      fields: this.fieldsToRead(ctx, Object.keys(sort)),
    });
    const { records, joins } = await this.withJoins(ctx, found);
    const saveAs = saveAsKey(ctx.config, 'records');
    return {
      outputHandle: records.length ? 'found' : 'empty',
      output: { collection, count: records.length, savedAs: `context.${saveAs}`, ...(joins.length ? { joins } : {}), records },
      contextPatch: { [saveAs]: records },
    };
  }
}
