import { ValidationFailedError } from '../domain/errors';
import { buildQuery, parseFilter, parseSort } from './record-query';

describe('record query language', () => {
  it('parses equality and whitelisted operators', () => {
    expect(parseFilter({ status: 'active', price: { $gte: 100, $lt: 500 }, tags: { $in: ['a', 'b'] } })).toEqual([
      { field: 'status', op: '$eq', value: 'active' },
      { field: 'price', op: '$gte', value: 100 },
      { field: 'price', op: '$lt', value: 500 },
      { field: 'tags', op: '$in', value: ['a', 'b'] },
    ]);
    expect(parseFilter(undefined)).toEqual([]);
  });

  it.each([
    [{ $where: 'sleep(1000)' }, 'not valid'],
    [{ name: { $regex: '.*' } }, 'Unknown filter operator'],
    [{ name: { $eq: { $gt: '' } } }, 'plain value'],
    [{ name: { nested: 1 } }, 'Unknown filter operator'],
    [{ tags: { $in: [{ $gt: 1 }] } }, 'list of up to'],
    [{ 'a..b': 1 }, 'not valid'],
    [['x'], 'JSON object'],
  ])('rejects unsafe or malformed filter %j', (filter, message) => {
    expect(() => parseFilter(filter)).toThrow(ValidationFailedError);
    try {
      parseFilter(filter);
    } catch (error) {
      expect((error as ValidationFailedError).issues[0].message).toContain(message);
    }
  });

  it('parses sort and clamps paging', () => {
    expect(parseSort({ price: 1, name: 'desc' })).toEqual([
      { field: 'price', direction: 1 },
      { field: 'name', direction: -1 },
    ]);
    expect(buildQuery({ limit: 10_000, skip: -5 })).toMatchObject({ limit: 500, skip: 0 });
    expect(() => parseSort({ price: 2 })).toThrow('must be 1 or -1');
  });
});
