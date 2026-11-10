import { Injectable } from '@nestjs/common';
import { collectionField, saveAsField, saveAsKey } from '../../domain/node-config';
import { BY_ID, changesField, DataNode, findByField, findByOf, findValueField, operationsField, UPDATE_JSON_SETTINGS } from './data-node.base';
import { TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { ConfigField, NodeExecutionContext, NodeExecutionResult } from '../../domain/workflow-node.types';
import { FAILED_OUTPUT } from '../../domain/workflow-node.constants';
import { isPlainObject, parseJsonValue } from '../../../../shared/util/json-setting';

/** A JSON setting with something in it (bad JSON counts: it is reported on its own). */
function filled(value: unknown): boolean {
  try {
    const parsed = parseJsonValue(value, 'setting');
    return isPlainObject(parsed) ? Object.keys(parsed).length > 0 : parsed !== undefined;
  } catch {
    return true;
  }
}

const onlyIfField: ConfigField = {
  key: 'onlyIf',
  label: 'Only if',
  kind: 'json',
  placeholder: '{"balance": {"$gte": "{{context.amount}}"}}',
  help: `Change it only when it also matches this filter — checked and written at once, so two runs can't both pass. Otherwise the “Condition not met” path. ${TYPED_JSON_HELP}`,
};

const upsertField: ConfigField = {
  key: 'upsert',
  label: 'Create it when missing',
  kind: 'boolean',
  default: false,
  help: 'With “Find by” a field (e.g. sellerId): no match creates the record with that value, the changes and $setOnInsert. Can’t be combined with Only if.',
};

/**
 * Changes one record — by id or the newest matching a field — with fields to set and MongoDB's
 * atomic operators ($inc, $push, …), optionally only if it matches a condition, or creating it.
 */
@Injectable()
export class DataUpdateNode extends DataNode {
  protected readonly jsonSettings = [...UPDATE_JSON_SETTINGS, { key: 'onlyIf', label: 'Only if' }];

  readonly definition = {
    type: 'data.update',
    category: 'data' as const,
    label: 'Update record',
    description: 'Changes one record: set fields, or MongoDB operators such as $inc and $push — atomically, optionally only if it matches a condition, or creating it when missing.',
    icon: 'file-pen',
    configSchema: [collectionField, findByField, findValueField, changesField, operationsField, onlyIfField, upsertField, saveAsField('record')],
    outputs: [
      { id: 'updated', label: 'Updated' },
      { id: 'created', label: 'Created' },
      { id: 'not_found', label: 'Not found' },
      { id: 'unmet', label: 'Condition not met' },
      FAILED_OUTPUT,
    ],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = super.validateConfig(config);
    if (!filled(config.changes) && !filled(config.operations)) errors.push('Give Changes or Operators — there is nothing to change');
    if (config.upsert === true && findByOf(config) === BY_ID) errors.push('“Create it when missing” needs “Find by” a field (e.g. sellerId), not id');
    if (config.upsert === true && filled(config.onlyIf)) errors.push('“Only if” and “Create it when missing” can’t be combined');
    return errors;
  }

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const target = this.target(ctx);
    const { outcome, record } = await this.data.changeRecord(ctx.tenantId, collection, target, this.updateDocument(ctx), {
      onlyIf: this.jsonObject(ctx, 'onlyIf', 'Only if'),
      upsert: ctx.config.upsert === true,
    });
    const lookup = 'id' in target ? { id: target.id } : { findBy: target.field, value: target.value };
    if (!record) return { outputHandle: outcome, output: { collection, ...lookup, outcome } };
    const saveAs = saveAsKey(ctx.config, 'record');
    return { outputHandle: outcome, output: { collection, ...lookup, outcome, savedAs: `context.${saveAs}`, record }, contextPatch: { [saveAs]: record } };
  }
}
