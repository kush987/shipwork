import { Injectable } from '@nestjs/common';
import { collectionField, saveAsField, saveAsKey } from '../../domain/node-config';
import { FAILED_OUTPUT } from '../../domain/workflow-node.constants';
import { changesField, DataNode, operationsField, recordFilterField, UPDATE_JSON_SETTINGS } from './data-node.base';
import type { ConfigField, NodeExecutionContext, NodeExecutionResult } from '../../domain/workflow-node.types';

const allField: ConfigField = {
  key: 'all',
  label: 'Every record when the filter is empty',
  kind: 'boolean',
  default: false,
  help: 'Off: an empty filter (e.g. a placeholder that came out empty) fails instead of touching every record.',
};

/** One change applied to every record a filter matches, in one database operation. */
@Injectable()
export class DataUpdateManyNode extends DataNode {
  protected readonly jsonSettings = [{ key: 'filter', label: 'Filter' }, ...UPDATE_JSON_SETTINGS];

  readonly definition = {
    type: 'data.update_many',
    category: 'data' as const,
    label: 'Update many records',
    description: 'Applies one change (fields to set, or operators such as $inc and $push) to every record that matches a filter. Saves { matched, modified }.',
    icon: 'files',
    configSchema: [collectionField, recordFilterField, changesField, operationsField, allField, saveAsField('updated')],
    outputs: [{ id: 'default', label: 'Changed' }, { id: 'none', label: 'None matched' }, FAILED_OUTPUT],
  };

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const result = await this.data.updateMany(ctx.tenantId, collection, {
      filter: this.jsonObject(ctx, 'filter', 'Filter'),
      all: ctx.config.all === true,
      update: this.updateDocument(ctx),
    });
    const saveAs = saveAsKey(ctx.config, 'updated');
    return { outputHandle: result.matched ? 'default' : 'none', output: { collection, ...result, savedAs: `context.${saveAs}` }, contextPatch: { [saveAs]: result } };
  }
}

/** Every record a filter matches, deleted in one database operation. */
@Injectable()
export class DataDeleteManyNode extends DataNode {
  protected readonly jsonSettings = [{ key: 'filter', label: 'Filter' }];

  readonly definition = {
    type: 'data.delete_many',
    category: 'data' as const,
    label: 'Delete many records',
    description: 'Deletes every record that matches a filter. Saves { deleted }.',
    icon: 'trash-2',
    configSchema: [collectionField, recordFilterField, allField, saveAsField('deleted')],
    outputs: [{ id: 'default', label: 'Deleted' }, { id: 'none', label: 'None matched' }, FAILED_OUTPUT],
  };

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const result = await this.data.deleteMany(ctx.tenantId, collection, { filter: this.jsonObject(ctx, 'filter', 'Filter'), all: ctx.config.all === true });
    const saveAs = saveAsKey(ctx.config, 'deleted');
    return { outputHandle: result.deleted ? 'default' : 'none', output: { collection, ...result, savedAs: `context.${saveAs}` }, contextPatch: { [saveAs]: result } };
  }
}

/** A MongoDB aggregation pipeline over one collection: totals, groups, joins, buckets. */
@Injectable()
export class DataAggregateNode extends DataNode {
  protected readonly jsonSettings = [{ key: 'pipeline', label: 'Pipeline', shape: 'any' as const }];

  readonly definition = {
    type: 'data.aggregate',
    category: 'data' as const,
    label: 'Aggregate',
    description:
      'Runs a MongoDB aggregation pipeline ($match, $group, $lookup, $facet, $bucket, …) over a collection and saves the results — totals, groups and reports in one query.',
    icon: 'sigma',
    configSchema: [
      collectionField,
      {
        key: 'pipeline',
        label: 'Pipeline',
        kind: 'json' as const,
        required: true,
        default: '[{"$match": {"status": "paid"}}, {"$group": {"_id": "$sellerId", "total": {"$sum": "$amount"}, "orders": {"$sum": 1}}}, {"$sort": {"total": -1}}]',
        help:
          'MongoDB stages, read-only ($out, $merge and code are refused). $lookup / $unionWith name your collections (e.g. "orders"). The id is _id; dates in $match can be written as 2026-11-01. Placeholders work. At most 1000 results.',
      } satisfies ConfigField,
      saveAsField('results'),
    ],
    outputs: [{ id: 'found', label: 'Found' }, { id: 'empty', label: 'None' }, FAILED_OUTPUT],
  };

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const { results, truncated } = await this.data.aggregate(ctx.tenantId, collection, this.jsonValue(ctx, 'pipeline', 'Pipeline'));
    const saveAs = saveAsKey(ctx.config, 'results');
    return {
      outputHandle: results.length ? 'found' : 'empty',
      output: { collection, count: results.length, ...(truncated ? { truncated } : {}), savedAs: `context.${saveAs}`, results },
      contextPatch: { [saveAs]: results },
    };
  }
}

/** The different values one field has, e.g. every city orders went to. */
@Injectable()
export class DataDistinctNode extends DataNode {
  protected readonly jsonSettings = [{ key: 'filter', label: 'Filter' }];

  readonly definition = {
    type: 'data.distinct',
    category: 'data' as const,
    label: 'Distinct values',
    description: 'Lists the different values of one field among the records that match a filter (each list item counts on its own).',
    icon: 'list-filter',
    configSchema: [
      collectionField,
      { key: 'field', label: 'Field', kind: 'text' as const, required: true, placeholder: 'status', help: 'A field or nested path, e.g. deliveryAddress.city' } satisfies ConfigField,
      recordFilterField,
      saveAsField('values'),
    ],
    outputs: [{ id: 'found', label: 'Found' }, { id: 'empty', label: 'None' }],
  };

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const { field, values, truncated } = await this.data.distinct(ctx.tenantId, collection, this.text(ctx, 'field'), this.jsonObject(ctx, 'filter', 'Filter'));
    const saveAs = saveAsKey(ctx.config, 'values');
    return {
      outputHandle: values.length ? 'found' : 'empty',
      output: { collection, field, count: values.length, ...(truncated ? { truncated } : {}), savedAs: `context.${saveAs}`, values },
      contextPatch: { [saveAs]: values },
    };
  }
}
