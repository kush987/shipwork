import { inMemoryDataService } from '../../../testing/data-fakes';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { buildQuery } from '../../../shared/query/record-query';
import { checkPipeline } from '../domain/aggregation-pipeline';
import { DuplicateValueError } from '../domain/data-collection.errors';

const WALLETS = {
  name: 'wallets',
  fields: [
    { key: 'sellerId', type: 'string' as const, required: true, unique: true },
    { key: 'balance', type: 'number' as const, required: true },
    { key: 'tags', type: 'array' as const, required: false },
    { key: 'lastPaidAt', type: 'date' as const, required: false },
  ],
};

const messages = (error: unknown) => (error as ValidationFailedError).issues.map((i) => i.message);

async function setup() {
  const data = inMemoryDataService();
  await data.service.createCollection('t', WALLETS);
  const wallet = await data.service.createRecord('t', 'wallets', { sellerId: 's1', balance: 100, tags: ['new'] });
  return { ...data, wallet };
}

describe('update operators', () => {
  it('applies $inc $mul $push $addToSet $pull $max $unset $currentDate as MongoDB does', async () => {
    const { service, wallet } = await setup();
    const { outcome, record } = await service.changeRecord('t', 'wallets', { id: wallet.id }, {
      $inc: { balance: -30 },
      $push: { tags: { $each: ['vip', 'gold'], $slice: -2 } },
      $addToSet: { labels: ['a', 'a', 'b'] },
      $max: { best: 7 },
      $currentDate: { seenAt: true },
    });
    expect(outcome).toBe('updated');
    expect(record).toMatchObject({ balance: 70, tags: ['vip', 'gold'], labels: ['a', 'b'], best: 7 });
    expect(typeof record!.seenAt).toBe('string');

    const next = await service.changeRecord('t', 'wallets', { id: wallet.id }, { $pull: { tags: 'vip' }, $mul: { balance: 2 }, $unset: ['best'] });
    expect(next.record).toMatchObject({ balance: 140, tags: ['gold'] });
    expect(next.record).not.toHaveProperty('best');
  });

  it('refuses what MongoDB or the schema wouldn’t take, naming every problem', async () => {
    const { service, wallet } = await setup();
    const change = (update: unknown) => service.changeRecord('t', 'wallets', { id: wallet.id }, update).catch(messages);
    expect(await change({ $inc: { balance: 'ten' } })).toEqual(['$inc: balance needs a number']);
    expect(await change({ $inc: { tags: 1 } })).toEqual(['$inc: tags is a list field, not a number']);
    expect(await change({ $push: { balance: 1 } })).toEqual(['$push: balance is a number field, not a list']);
    expect(await change({ $set: { balance: 1 }, $inc: { balance: 1 } })).toEqual(['“balance” is changed by both $set and $inc — use one']);
    expect(await change({ $unset: ['sellerId'] })).toEqual(['sellerId is required and can\'t be removed']);
    expect(await change({ $set: { createdAt: 'x' } })).toEqual(['$set: createdAt is set by the data store and can\'t be changed']);
    expect(await change({ $rename: { a: 'b' } })).toEqual([expect.stringContaining('Unknown operator $rename')]);
    expect(await change({ status: 'x', $inc: { balance: 1 } })).toEqual([expect.stringContaining('not both')]);
    expect(await change({})).toEqual(['Nothing to change']);
    expect(await change({ $set: { lastPaidAt: 'yesterday' } })).toEqual(['lastPaidAt must be a date like 2026-11-09']);
  });

  it('keeps $inc results free of floating-point noise (money stays 20.42, not 20.419999999999998)', async () => {
    const { service, wallet } = await setup();
    await service.changeRecord('t', 'wallets', { id: wallet.id }, { $inc: { balance: -30.42 } });
    const { record } = await service.changeRecord('t', 'wallets', { id: wallet.id }, { $inc: { balance: -49.16 } });
    expect(record!.balance).toBe(20.42);
  });

  it('onlyIf is checked with the write: updated, unmet (exists, condition false) or not_found', async () => {
    const { service, wallet } = await setup();
    const debit = (id: string, amount: number) =>
      service.changeRecord('t', 'wallets', { id }, { $inc: { balance: -amount } }, { onlyIf: { balance: { $gte: amount } } });
    expect((await debit(wallet.id, 60)).outcome).toBe('updated');
    const short = await debit(wallet.id, 60);
    expect(short).toEqual({ outcome: 'unmet', record: null });
    expect((await service.requireRecord('t', 'wallets', wallet.id)).balance).toBe(40);
    expect((await debit('rec_nope', 1)).outcome).toBe('not_found');
  });

  it('upsert by a field: creates the record the first time ($setOnInsert too), updates it after', async () => {
    const { service } = await setup();
    const credit = (amount: number) =>
      service.changeRecord('t', 'wallets', { field: 'sellerId', value: 's2' }, { $inc: { balance: amount }, $setOnInsert: { tags: ['opened'] } }, { upsert: true });
    const first = await credit(50);
    expect(first.outcome).toBe('created');
    expect(first.record).toMatchObject({ sellerId: 's2', balance: 50, tags: ['opened'] });
    const second = await credit(25);
    expect(second).toMatchObject({ outcome: 'updated', record: { sellerId: 's2', balance: 75, tags: ['opened'] } });

    const bad = (target: object, options: object) => service.changeRecord('t', 'wallets', target as never, { $inc: { balance: 1 } }, options).catch(messages);
    expect(await bad({ id: 'x' }, { upsert: true })).toEqual([expect.stringContaining('needs a field to find it by')]);
    expect(await bad({ field: 'sellerId', value: 's3' }, { upsert: true, onlyIf: { balance: 1 } })).toEqual([expect.stringContaining('can’t be combined')]);
    // A record created this way still needs its required fields.
    const missing = await service
      .changeRecord('t', 'wallets', { field: 'sellerId', value: 's4' }, { $push: { tags: 'x' } }, { upsert: true })
      .catch((e: Error) => e.message);
    expect(missing).toContain('balance is required');
  });

  it('a unique field still holds for operator changes', async () => {
    const { service, wallet } = await setup();
    await service.createRecord('t', 'wallets', { sellerId: 's2', balance: 1 });
    await expect(service.changeRecord('t', 'wallets', { id: wallet.id }, { $set: { sellerId: 's2' } })).rejects.toBeInstanceOf(DuplicateValueError);
  });
});

describe('many records', () => {
  it('update-many and delete-many need a filter, or all: true', async () => {
    const { service } = await setup();
    await service.createRecord('t', 'wallets', { sellerId: 's2', balance: 5 });
    await service.createRecord('t', 'wallets', { sellerId: 's3', balance: 500 });
    await expect(service.updateMany('t', 'wallets', { update: { $inc: { balance: 1 } } })).rejects.toThrow('Give a filter — or all: true');
    expect(await service.updateMany('t', 'wallets', { filter: { balance: { $lt: 200 } }, update: { $push: { tags: 'low' } } })).toEqual({ matched: 2, modified: 2 });
    expect(await service.updateMany('t', 'wallets', { all: true, update: { $inc: { balance: 1 } } })).toEqual({ matched: 3, modified: 3 });
    expect(await service.deleteMany('t', 'wallets', { filter: { tags: 'low' } })).toEqual({ deleted: 2 });
    expect((await service.listRecords('t', 'wallets', {})).records.map((r) => r.balance)).toEqual([501]);
  });

  it('distinct lists each value once, list items one by one', async () => {
    const { service } = await setup();
    await service.createRecord('t', 'wallets', { sellerId: 's2', balance: 5, tags: ['new', 'vip'] });
    expect(await service.distinct('t', 'wallets', 'tags')).toEqual({ field: 'tags', values: ['new', 'vip'], truncated: false });
    expect((await service.distinct('t', 'wallets', 'sellerId', { balance: { $lt: 50 } })).values).toEqual(['s2']);
  });
});

describe('reading', () => {
  it('dates: stored in one form, compared as dates', async () => {
    const { service } = await setup();
    const paid = await service.createRecord('t', 'wallets', { sellerId: 's2', balance: 1, lastPaidAt: '2026-11-09' });
    expect(paid.lastPaidAt).toBe('2026-11-09T00:00:00.000Z');
    await expect(service.createRecord('t', 'wallets', { sellerId: 's3', balance: 1, lastPaidAt: 'soon' })).rejects.toThrow('lastPaidAt must be a date');
    expect((await service.listRecords('t', 'wallets', { filter: { lastPaidAt: { $gte: '2026-11-01T00:00:00.000Z' } } })).total).toBe(1);
  });

  it('fields limits what records carry (id and timestamps always); $text searches, best first without a sort', async () => {
    const { service, wallet } = await setup();
    await service.createRecord('t', 'wallets', { sellerId: 'red-shirt-shop', balance: 1 });
    const [only] = (await service.listRecords('t', 'wallets', { fields: 'balance', filter: { sellerId: 's1' } })).records;
    expect(Object.keys(only).sort()).toEqual(['balance', 'createdAt', 'id', 'updatedAt']);
    expect(Object.keys((await service.getRecord('t', 'wallets', wallet.id, ['sellerId']))!).sort()).toEqual(['createdAt', 'id', 'sellerId', 'updatedAt']);

    const found = await service.listRecords('t', 'wallets', { filter: { $text: 'shirt' } });
    expect(found.records.map((r) => r.sellerId)).toEqual(['red-shirt-shop']);
    expect(buildQuery({ filter: { $text: 'shirt' } }).relevance).toBe(true);
    expect(buildQuery({ filter: { $text: 'shirt' }, sort: { balance: 1 } }).relevance).toBeUndefined();
    await expect(service.listRecords('t', 'wallets', { filter: { $text: '' } })).rejects.toThrow('$text needs the words');
  });
});

describe('aggregation pipelines', () => {
  it('allows reading stages and points lookups at the workspace’s collections', () => {
    const { pipeline, issues } = checkPipeline(
      [
        { $match: { status: 'paid' } },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unionWith: { coll: 'archive', pipeline: [{ $match: { status: 'paid' } }] } },
        { $facet: { top: [{ $sortByCount: '$productId' }], n: [{ $count: 'n' }] } },
        { $group: { _id: '$sellerId', total: { $sum: '$amount' } } },
      ],
      ['orders', 'products', 'archive'],
    );
    expect(issues).toEqual([]);
    expect(pipeline[1]).toEqual({ $lookup: { from: 'data.products', localField: 'productId', foreignField: '_id', as: 'product' } });
    expect((pipeline[2] as { $unionWith: { coll: string } }).$unionWith.coll).toBe('data.archive');
  });

  it('refuses stages and operators that write or run code, anywhere, and unknown collections', () => {
    const issues = (pipeline: unknown) => checkPipeline(pipeline, ['orders']).issues;
    expect(issues([{ $out: 'x' }])).toEqual([expect.stringContaining('$out isn\'t allowed')]);
    expect(issues([{ $addFields: { x: { $function: { body: 'return 1', args: [], lang: 'js' } } } }])).toEqual([expect.stringContaining('$function isn\'t allowed')]);
    expect(issues([{ $match: { $where: 'true' } }])).toEqual([expect.stringContaining('$where isn\'t allowed')]);
    expect(issues([{ $lookup: { from: 'users', as: 'u', pipeline: [{ $merge: 'y' }] } }])).toEqual([
      expect.stringContaining('“users” is not one of your collections'),
      expect.stringContaining('$merge isn\'t allowed'),
    ]);
    expect(issues([{ $match: {}, $limit: 1 }])).toEqual([expect.stringContaining('one operator')]);
    expect(issues([])).toEqual([expect.stringContaining('list of stages')]);
    // Text search inside $match is fine.
    expect(issues([{ $match: { $text: { $search: 'shirt' } } }])).toEqual([]);
  });
});
