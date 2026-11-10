import { Logger } from '@nestjs/common';
import { inMemoryDataService } from '../../../testing/data-fakes';
import { DataTransactionService } from './data-transaction.service';
import { DataTransactionNode } from '../../nodes/implementations/data/data-transaction.node';
import { toWorkflowRequest } from '../../nodes/domain/triggers';
import { renderTyped } from '../../../shared/util/path';
import type { NodeExecutionContext } from '../../nodes/domain/workflow-node.types';

async function setup() {
  const { service, records } = inMemoryDataService();
  await service.createCollection('t', {
    name: 'wallets',
    fields: [
      { key: 'sellerId', type: 'string', required: true, unique: true },
      { key: 'balance', type: 'number', required: true },
    ],
  });
  await service.createCollection('t', {
    name: 'ledger',
    fields: [
      { key: 'reference', type: 'string', required: true, unique: true },
      { key: 'amount', type: 'number', required: true },
      { key: 'balanceAfter', type: 'number', required: false },
    ],
  });
  await service.createRecord('t', 'wallets', { sellerId: 's1', balance: 100 });
  return { service, transactions: new DataTransactionService(service, records) };
}

const debit = (amount: number, reference: string) => [
  { op: 'update', collection: 'wallets', findBy: 'sellerId', value: 's1', update: { $inc: { balance: -amount } }, onlyIf: { balance: { $gte: amount } }, as: 'wallet' },
  { op: 'insert', collection: 'ledger', record: { reference, amount, balanceAfter: '{{tx.wallet.balance}}' }, as: 'entry' },
];

const ctx = (config: Record<string, unknown>): NodeExecutionContext => ({
  tenantId: 't',
  executionId: 'ex',
  nodeId: 'n',
  idempotencyKey: 'ex:n',
  attempt: 1,
  isFinalAttempt: true,
  config,
  data: { trigger: { event: 'http.request', data: {} }, context: { amount: 30 }, request: toWorkflowRequest({ method: 'post', path: '/x', params: {}, body: null }), shipment: null },
  logger: new Logger('test'),
});

describe('transactions', () => {
  it('commits every write, later ones reading earlier results (the Transaction step fills {{tx.…}})', async () => {
    const { service, transactions } = await setup();
    const node = new DataTransactionNode(transactions);
    // A placeholder that renders to nothing can't be a number: rolled back as invalid, nothing written.
    const [first, second] = debit(30, 'pay-1');
    const invalid = await node.execute(ctx({ operations: [{ ...first, update: { $inc: { balance: '{{context.missing}}' } } }, second], saveAs: 'tx' }));
    expect(invalid).toMatchObject({ outputHandle: 'aborted', contextPatch: { tx: { committed: false, reason: 'invalid', abortedAt: { as: 'wallet' } } } });
    const committed = await node.execute(ctx({ operations: debit(30, 'pay-2'), saveAs: 'tx' }));
    expect(committed).toMatchObject({ outputHandle: 'committed', contextPatch: { tx: { committed: true, wallet: { balance: 70 }, entry: { reference: 'pay-2', balanceAfter: 70 } } } });
    expect((await service.findRecords('t', 'ledger', {})).map((r) => r.reference)).toEqual(['pay-2']);
  });

  it('rolls everything back when a write can’t happen, saying which and why', async () => {
    const { service, transactions } = await setup();
    // As the Transaction step does: each operation filled in with the results before it.
    const pay = (amount: number, reference: string) => transactions.run('t', 2, (i, tx) => renderTyped(debit(amount, reference)[i], { tx }));
    expect(await pay(30, 'pay-1')).toMatchObject({ committed: true, results: { entry: { balanceAfter: 70 } } });

    // Not enough balance: the first write's condition fails.
    const short = await pay(500, 'pay-2');
    expect(short).toMatchObject({ committed: false, reason: 'unmet', abortedAt: { index: 0, as: 'wallet', op: 'update', collection: 'wallets' } });

    // The second write repeats a unique reference: the first (already applied) is undone too.
    const repeated = await pay(10, 'pay-1');
    expect(repeated).toMatchObject({ committed: false, reason: 'duplicate', abortedAt: { index: 1, as: 'entry' } });
    expect(repeated.message).toContain('already has reference “pay-1”');
    expect((await service.findRecords('t', 'wallets', {}))[0].balance).toBe(70);
    expect(await service.findRecords('t', 'ledger', {})).toHaveLength(1);

    const missing = await transactions.run('t', 1, () => ({ op: 'delete', collection: 'ledger', id: 'rec_nope' }));
    expect(missing).toMatchObject({ committed: false, reason: 'not_found', abortedAt: { as: 'op1' } });
  });

  it('refuses malformed operations before writing anything', async () => {
    const { transactions } = await setup();
    await expect(transactions.run('t', 0, () => ({}))).rejects.toThrow('1–20 operations');
    await expect(transactions.run('t', 1, () => ({ op: 'upsert', collection: 'wallets' }))).rejects.toThrow('"op" must be insert, update or delete');
    await expect(transactions.run('t', 1, () => ({ op: 'update', collection: 'wallets', update: { $inc: { balance: 1 } } }))).rejects.toThrow('either "id" or "findBy"');
    await expect(transactions.run('t', 2, () => ({ op: 'insert', collection: 'ledger', record: { reference: 'x', amount: 1 }, as: 'same' }))).rejects.toThrow('Two operations are named “same”');
    await expect(transactions.run('t', 1, () => ({ op: 'insert', collection: 'nowhere', record: {} }))).rejects.toThrow("Collection 'nowhere' not found");
  });
});
