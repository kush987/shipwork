import { evaluateCondition } from './condition-evaluator';

describe('evaluateCondition', () => {
  it.each([
    [2500, 'gt', '2000', true],
    [2000, 'gt', '2000', false],
    [2000, 'gte', 2000, true],
    ['1500', 'lt', '2000', true],
    ['COD', 'eq', 'cod', true],
    ['PREPAID', 'neq', 'COD', true],
    [true, 'eq', 'true', true],
    ['560001', 'in', '110001, 560001', true],
    [['high-value', 'vip'], 'contains', 'vip', true],
    ['Bengaluru', 'contains', 'galu', true],
    [undefined, 'exists', '', false],
    [0, 'exists', '', true],
    [null, 'not_exists', '', true],
    ['abc', 'gt', '1', false],
  ] as const)('%p %s %p → %p', (actual, op, expected, result) => {
    expect(evaluateCondition(actual, op, expected)).toBe(result);
  });
});

describe('evaluateCondition on item SKUs', () => {
  it('matches when any SKU equals the value', () => {
    expect(evaluateCondition(['KUR-001', 'DUP-004'], 'contains', 'dup-004')).toBe(true);
    expect(evaluateCondition(['KUR-001'], 'contains', 'DUP-004')).toBe(false);
  });
});

describe('evaluateCondition: more operators', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  it.each([
    [250, 'between', '100, 500', true],
    [600, 'between', '500, 100', false],
    ['2026-11-01', 'between', 'now-7d, now', true],
    ['2026-10-01', 'between', 'now-7d, now', false],
    [250, 'between', '100', false],
    ['Bengaluru', 'not_contains', 'mumbai', true],
    [['vip'], 'not_contains', 'VIP', false],
    ['KUR-001', 'starts_with', 'kur', true],
    [['DUP-004', 'KUR-001'], 'starts_with', 'KUR', true],
    ['order.pdf', 'ends_with', '.PDF', true],
    ['560001', 'not_in', '110001, 400001', true],
    ['COD', 'not_in', 'cod, prepaid', false],
    ['2026-11-01T00:00:00Z', 'before', 'now-3d', true],
    ['2026-11-06', 'after', 'now-2d', true],
    [now - 3_600_000, 'after', 'now-2h', true],
    ['soon', 'before', 'now', false],
    ['  ', 'is_empty', '', true],
    [[], 'is_empty', '', true],
    [{}, 'is_empty', '', true],
    [0, 'is_empty', '', false],
    [['a'], 'is_not_empty', '', true],
    [true, 'is_true', '', true],
    ['TRUE', 'is_true', '', true],
    ['yes', 'is_true', '', false],
    [false, 'is_false', '', true],
  ] as const)('%p %s %p → %p', (actual, op, expected, result) => {
    expect(evaluateCondition(actual, op, expected, now)).toBe(result);
  });
});
