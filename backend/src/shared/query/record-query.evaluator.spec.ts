import { buildQuery } from './record-query';
import { runInMemory } from './record-query.evaluator';
import { directMapping, toMongoFilter, toMongoSort } from './mongo-record-query';

const rows = [
  { id: 'a', name: 'Delhi FC', city: 'New Delhi', active: true, rank: 3, tags: ['north', 'hub'], address: { pincode: '110020' } },
  { id: 'b', name: 'Bhiwandi WH', city: 'Bhiwandi', active: false, rank: 1, tags: ['west'], address: { pincode: '421302' } },
  { id: 'c', name: 'Bengaluru DC', city: 'Bengaluru', active: true, rank: 2, tags: [], address: { pincode: '560001' } },
];
const run = (input: Parameters<typeof buildQuery>[0]) => runInMemory(rows, buildQuery(input));

describe('in-memory query evaluation', () => {
  it('filters with the whitelisted operators, including nested paths', () => {
    expect(run({ filter: { active: true } }).records.map((r) => r.id)).toEqual(['a', 'c']);
    expect(run({ filter: { rank: { $gte: 2 }, name: { $contains: 'delhi' } } }).records.map((r) => r.id)).toEqual(['a']);
    expect(run({ filter: { 'address.pincode': { $in: ['421302', '560001'] } } }).records.map((r) => r.id).sort()).toEqual(['b', 'c']);
    expect(run({ filter: { missing: { $exists: false } } }).total).toBe(3);
  });

  it('matches a list field when any element matches, like Mongo', () => {
    expect(run({ filter: { tags: 'hub' } }).records.map((r) => r.id)).toEqual(['a']);
    expect(run({ filter: { tags: { $ne: 'west' } } }).records.map((r) => r.id).sort()).toEqual(['a', 'c']);
  });

  it('sorts, pages and reports the total before paging', () => {
    expect(run({ sort: { rank: 1 }, limit: 2 })).toEqual({ total: 3, records: [rows[1], rows[2]] });
    expect(run({ sort: { rank: 1 }, limit: 2, skip: 2 }).records).toEqual([rows[0]]);
  });
});

describe('direct Mongo mapping', () => {
  it('maps id to _id and converts the declared date fields', () => {
    const mapping = directMapping(['createdAt']);
    expect(toMongoFilter(buildQuery({ filter: { id: 'x', 'customer.name': 'P', createdAt: { $lt: '2026-01-01T00:00:00Z' } } }).conditions, mapping)).toEqual({
      _id: { $eq: 'x' },
      'customer.name': { $eq: 'P' },
      createdAt: { $lt: new Date('2026-01-01T00:00:00Z') },
    });
    expect(toMongoSort([{ field: 'orderValue', direction: 1 }], mapping)).toEqual({ orderValue: 1, _id: 1 });
  });
});
