import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { isPlainObject, jsonSettingErrors, parseJsonValue } from '../../../../shared/util/json-setting';
import { renderTyped } from '../../../../shared/util/path';
import { DataTransactionService } from '../../../data/application/data-transaction.service';
import { MAX_TRANSACTION_OPERATIONS } from '../../../data/application/data-transaction.constants';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { asStep } from '../../domain/step-errors';
import { FAILED_OUTPUT } from '../../domain/workflow-node.constants';
import type { NodeExecutionContext, NodeExecutionResult, NodeTypeDefinition, WorkflowNode } from '../../domain/workflow-node.types';

const EXAMPLE = JSON.stringify(
  [
    {
      op: 'update',
      collection: 'wallets',
      findBy: 'sellerId',
      value: '{{request.auth.id}}',
      update: { $inc: { balance: '{{context.charge}}' } },
      onlyIf: { balance: { $gte: '{{context.amount}}' } },
      as: 'wallet',
    },
    { op: 'insert', collection: 'wallet_ledger', record: { sellerId: '{{request.auth.id}}', amount: '{{context.amount}}', balanceAfter: '{{tx.wallet.balance}}' }, as: 'entry' },
  ],
  null,
  0,
);

/**
 * Writes across collections that all happen or none does — e.g. take money from a wallet and record
 * it in the ledger. Later operations can use earlier results ({{tx.wallet.balance}}). A write that
 * can't happen (record missing, Only if not met, duplicate, not fitting the collection) rolls every
 * one back and takes the Rolled back path, saying which and why.
 */
@Injectable()
export class DataTransactionNode implements WorkflowNode {
  constructor(private readonly transactions: DataTransactionService) {}

  readonly definition: NodeTypeDefinition = {
    type: 'data.transaction',
    category: 'data',
    label: 'Transaction',
    description: 'Several record writes across collections that all happen or none does (a MongoDB transaction). Later writes can use earlier results.',
    icon: 'layers',
    configSchema: [
      {
        key: 'operations',
        label: 'Operations',
        kind: 'json',
        required: true,
        default: EXAMPLE,
        help:
          `Up to ${MAX_TRANSACTION_OPERATIONS}, in order: {"op": "insert", "collection", "record"} · {"op": "update", "collection", "id" or "findBy"+"value", "update" ($set/$inc/$push…), "onlyIf"?, "upsert"?} · ` +
          '{"op": "delete", "collection", "id"}. "as" names a result; {{tx.<as>.<field>}} reads it in later operations.',
      },
      saveAsField('tx', 'context.<name>.committed, the results by their "as", or reason / abortedAt / message when rolled back'),
    ],
    outputs: [{ id: 'committed', label: 'Committed' }, { id: 'aborted', label: 'Rolled back' }, FAILED_OUTPUT],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = [...saveAsErrors(config), ...jsonSettingErrors(config, [{ key: 'operations', label: 'Operations', shape: 'any' }])];
    if (errors.length) return errors;
    const operations = parseJsonValue(config.operations, 'Operations');
    if (!Array.isArray(operations) || !operations.length || operations.length > MAX_TRANSACTION_OPERATIONS) {
      return [`Operations must be a list of 1–${MAX_TRANSACTION_OPERATIONS} writes`];
    }
    operations.forEach((op, i) => {
      if (!isPlainObject(op)) errors.push(`Operation ${i + 1} must be an object`);
      else if (typeof op.collection !== 'string' || op.collection.includes('{{')) errors.push(`Operation ${i + 1}: "collection" must name a collection (no placeholders)`);
      else if (!['insert', 'update', 'delete'].includes(String(op.op))) errors.push(`Operation ${i + 1}: "op" must be insert, update or delete`);
    });
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const operations = parseJsonValue(ctx.config.operations, 'Operations');
    if (!Array.isArray(operations)) throw new NonRetryableError('Operations must be a list');
    // Each operation is filled in when its turn comes, so it can read the ones before it as {{tx.…}}.
    const result = await asStep(() => this.transactions.run(ctx.tenantId, operations.length, (i, tx) => renderTyped(operations[i], { ...ctx.data, tx })));
    const saveAs = saveAsKey(ctx.config, 'tx');
    const saved = result.committed
      ? { committed: true, ...result.results }
      : { committed: false, reason: result.reason, abortedAt: result.abortedAt, message: result.message };
    return { outputHandle: result.committed ? 'committed' : 'aborted', output: { ...result, savedAs: `context.${saveAs}` }, contextPatch: { [saveAs]: saved } };
  }
}
