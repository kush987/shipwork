import { Injectable } from '@nestjs/common';
import { FIELD_PATH } from '../../../../shared/query/record-query.constants';
import { dataSourceField, saveAsField, saveAsKey } from '../../domain/node-config';
import { BY_ID, DataNode, findByField, findByOf, findValueField, recordFieldsField } from './data-node.base';
import type { SourceRecord } from '../../../data/domain/data-source.types';
import type { NodeExecutionContext, NodeExecutionResult } from '../../domain/workflow-node.types';

@Injectable()
export class DataGetNode extends DataNode {
  protected readonly readsBuiltIn = true;
  readonly definition = {
    type: 'data.get',
    category: 'data' as const,
    label: 'Get record',
    description: 'Loads one record from a collection or built-in data by id or by any field, e.g. the product with this SKU.',
    icon: 'file-search',
    configSchema: [dataSourceField, findByField, findValueField, recordFieldsField, saveAsField('record')],
    outputs: [
      { id: 'found', label: 'Found' },
      { id: 'not_found', label: 'Not found' },
    ],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = super.validateConfig(config);
    const field = findByOf(config);
    if (!FIELD_PATH.test(field)) return [...errors, `“Find by” must be a field name such as sku or customer.email`];
    // Built-in data has a fixed set of fields, so a typo can be caught before publishing.
    const builtIn = this.sources.systemSourceInfo(String(config.collection ?? ''));
    if (builtIn && !builtIn.fields.some((f) => f.key === field)) {
      errors.push(`${builtIn.label} has no field “${field}” — use ${builtIn.fields.map((f) => f.key).join(', ')}`);
    }
    return errors;
  }

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const { record, lookup } = await this.find(ctx, collection);
    if (!record) return { outputHandle: 'not_found', output: { collection, ...lookup, found: false } };
    const saveAs = saveAsKey(ctx.config, 'record');
    return { outputHandle: 'found', output: { collection, ...lookup, savedAs: `context.${saveAs}`, record }, contextPatch: { [saveAs]: record } };
  }

  /** The record, and how it was looked up (shown in the step's output on Executions). */
  private async find(ctx: NodeExecutionContext, collection: string): Promise<{ record: SourceRecord | null; lookup: Record<string, unknown> }> {
    const field = findByOf(ctx.config);
    if (field === BY_ID) {
      const id = this.recordId(ctx);
      return { record: await this.sources.getRecord(ctx.tenantId, collection, id, this.fieldsToRead(ctx)), lookup: { id } };
    }
    const value = this.matchValue(ctx, field);
    // Two, so the output can say the match wasn't unique; the first is the newest.
    const [record = null, another] = await this.sources.findBy(ctx.tenantId, collection, field, value, 2, this.fieldsToRead(ctx));
    return { record, lookup: { findBy: field, value, ...(another ? { multipleMatches: true } : {}) } };
  }
}
