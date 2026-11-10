import { Logger } from '@nestjs/common';
import { DataUpdateNode } from './data-update.node';
import { DataDeleteManyNode, DataDistinctNode, DataUpdateManyNode } from './data-many.nodes';
import { DataQueryNode } from './data-query.node';
import { inMemoryDataService } from '../../../../testing/data-fakes';
import { toWorkflowRequest } from '../../domain/triggers';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';

const ctx = (config: Record<string, unknown>, body: unknown = null): NodeExecutionContext => ({
  tenantId: 't',
  executionId: 'ex',
  nodeId: 'n',
  idempotencyKey: 'ex:n',
  attempt: 1,
  isFinalAttempt: true,
  config,
  data: { trigger: { event: 'http.request', data: {} }, context: {}, request: toWorkflowRequest({ method: 'post', path: '/x', params: {}, body }), shipment: null },
  logger: new Logger('test'),
});

async function setup() {
  const { service, sources } = inMemoryDataService();
  await service.createCollection('t', {
    name: 'wallets',
    fields: [
      { key: 'sellerId', type: 'string', required: true, unique: true },
      { key: 'balance', type: 'number', required: true },
    ],
  });
  return { service, sources };
}

describe('Update record with operators', () => {
  it('debits only with enough balance (Condition not met otherwise), and opens a wallet on the first credit', async () => {
    const { service, sources } = await setup();
    const node = new DataUpdateNode(service, sources);
    const credit = ctx(
      { collection: 'wallets', findBy: 'sellerId', id: '{{request.body.sellerId}}', operations: { $inc: { balance: '{{request.body.amount}}' } }, upsert: true },
      { sellerId: 's1', amount: 100 },
    );
    expect(await node.execute(credit)).toMatchObject({ outputHandle: 'created', contextPatch: { record: { sellerId: 's1', balance: 100 } } });
    expect(await node.execute(credit)).toMatchObject({ outputHandle: 'updated', contextPatch: { record: { balance: 200 } } });

    const debit = (amount: number) =>
      node.execute(
        ctx(
          { collection: 'wallets', findBy: 'sellerId', id: 's1', operations: { $inc: { balance: -amount } }, onlyIf: { balance: { $gte: amount } } },
        ),
      );
    expect(await debit(150)).toMatchObject({ outputHandle: 'updated', contextPatch: { record: { balance: 50 } } });
    expect(await debit(150)).toMatchObject({ outputHandle: 'unmet', output: { outcome: 'unmet' } });
    expect(await node.execute(ctx({ collection: 'wallets', findBy: 'sellerId', id: 'nobody', changes: { balance: 1 } }))).toMatchObject({ outputHandle: 'not_found' });
  });

  it('checks its settings before publishing', () => {
    const { service, sources } = inMemoryDataService();
    const node = new DataUpdateNode(service, sources);
    expect(node.validateConfig({ collection: 'wallets', id: 'x', saveAs: 'record' })).toContain('Give Changes or Operators — there is nothing to change');
    expect(node.validateConfig({ collection: 'wallets', id: 'x', changes: { a: 1 }, upsert: true, saveAs: 'record' })).toContain(
      '“Create it when missing” needs “Find by” a field (e.g. sellerId), not id',
    );
    // Steps saved before operators existed keep working.
    expect(node.validateConfig({ collection: 'wallets', id: '{{request.params.id}}', changes: '{"status": "paid"}', saveAs: 'record' })).toEqual([]);
  });
});

describe('Update many, Delete many, Distinct values, Find records fields', () => {
  it('works over every matching record and saves what it did', async () => {
    const { service, sources } = await setup();
    for (const [sellerId, balance] of [['s1', 10], ['s2', 20], ['s3', 300]] as const) await service.createRecord('t', 'wallets', { sellerId, balance, tier: balance > 100 ? 'gold' : 'basic' });

    const many = new DataUpdateManyNode(service, sources);
    expect(await many.execute(ctx({ collection: 'wallets', filter: { tier: 'basic' }, operations: { $inc: { balance: 5 } }, saveAs: 'updated' }))).toMatchObject({
      outputHandle: 'default',
      contextPatch: { updated: { matched: 2, modified: 2 } },
    });
    expect(await many.execute(ctx({ collection: 'wallets', filter: { tier: 'none' }, changes: { x: 1 }, saveAs: 'updated' }))).toMatchObject({ outputHandle: 'none' });
    await expect(many.execute(ctx({ collection: 'wallets', filter: {}, changes: { x: 1 }, saveAs: 'updated' }))).rejects.toThrow('Give a filter');

    const distinct = new DataDistinctNode(service, sources);
    expect(await distinct.execute(ctx({ collection: 'wallets', field: 'tier', saveAs: 'values' }))).toMatchObject({ contextPatch: { values: ['basic', 'gold'] } });

    const find = new DataQueryNode(service, sources);
    const found = await find.execute(ctx({ collection: 'wallets', filter: { tier: 'basic' }, fields: 'balance', saveAs: 'records' }));
    expect((found.contextPatch!.records as Record<string, unknown>[]).map((r) => Object.keys(r).sort())).toEqual([
      ['balance', 'createdAt', 'id', 'updatedAt'],
      ['balance', 'createdAt', 'id', 'updatedAt'],
    ]);

    const remove = new DataDeleteManyNode(service, sources);
    expect(await remove.execute(ctx({ collection: 'wallets', filter: { balance: { $lt: 100 } }, saveAs: 'deleted' }))).toMatchObject({
      outputHandle: 'default',
      contextPatch: { deleted: { deleted: 2 } },
    });
  });
});
