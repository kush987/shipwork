import { evaluatePolicy, matchesPattern, policyIssues, conditionHolds } from './policy';
import type { Policy } from './policy.types';

const policy: Policy = {
  statements: [
    { effect: 'allow', actions: ['*'], resources: ['*'], roles: ['admin'], description: 'admins do anything' },
    { effect: 'allow', actions: ['orders:read'], resources: ['order:*'], roles: ['customer'] },
    { effect: 'allow', actions: ['orders:cancel'], resources: ['order:*'], roles: ['customer'], when: [{ left: 'u1', op: 'eq', right: 'u1' }] },
    { effect: 'deny', actions: ['orders:delete'], resources: ['*'], description: 'nobody deletes orders' },
  ],
};

describe('policy engine', () => {
  it('matches wildcards in actions and resources', () => {
    expect(matchesPattern('*', 'anything')).toBe(true);
    expect(matchesPattern('orders:*', 'orders:read')).toBe(true);
    expect(matchesPattern('orders:*', 'shipments:read')).toBe(false);
    expect(matchesPattern('path:/orders*', 'path:/orders/42')).toBe(true);
    expect(matchesPattern('order:4.2', 'order:442')).toBe(false); // dots are literal
  });

  it('denies by default, allows by role, and an explicit deny beats any allow', () => {
    expect(evaluatePolicy(policy, { action: 'orders:read', resource: 'order:7', roles: ['customer'] })).toEqual({ allowed: true, reason: 'Allowed by statement 2', statement: 1 });
    expect(evaluatePolicy(policy, { action: 'orders:read', resource: 'order:7', roles: [] })).toMatchObject({ allowed: false, reason: 'No statement allows orders:read on order:7' });
    expect(evaluatePolicy(policy, { action: 'reports:export', resource: 'report:q3', roles: ['admin'] })).toMatchObject({ allowed: true, reason: 'Allowed by “admins do anything”' });
    expect(evaluatePolicy(policy, { action: 'orders:delete', resource: 'order:7', roles: ['admin'] })).toMatchObject({ allowed: false, reason: 'Denied by “nobody deletes orders”', statement: 3 });
  });

  it('applies conditions (after placeholders were filled in)', () => {
    expect(evaluatePolicy(policy, { action: 'orders:cancel', resource: 'order:7', roles: ['customer'] }).allowed).toBe(true);
    const notOwner = { statements: [{ ...policy.statements[2], when: [{ left: 'u2', op: 'eq' as const, right: 'u1' }] }] };
    expect(evaluatePolicy(notOwner, { action: 'orders:cancel', resource: 'order:7', roles: ['customer'] }).allowed).toBe(false);
  });

  it('compares values the way users write them', () => {
    expect(conditionHolds({ left: 42, op: 'eq', right: '42' })).toBe(true);
    expect(conditionHolds({ left: 'admin', op: 'in', right: ['admin', 'ops'] })).toBe(true);
    expect(conditionHolds({ left: ['a', 'b'], op: 'contains', right: 'b' })).toBe(true);
    expect(conditionHolds({ left: 5000, op: 'gt', right: 1000 })).toBe(true);
    expect(conditionHolds({ left: '', op: 'exists' })).toBe(false);
    expect(conditionHolds({ left: 'x', op: 'not_in', right: ['y'] })).toBe(true);
  });

  it('explains what is wrong with a hand-written policy', () => {
    expect(policyIssues(policy)).toEqual([]);
    expect(policyIssues({})).toEqual(['A policy is { "statements": [ … ] }']);
    expect(policyIssues({ statements: [{ effect: 'maybe', actions: [], resources: ['*'], when: [{ op: 'like' }] }] })).toEqual([
      'Statement 1: effect must be "allow" or "deny"',
      'Statement 1: actions must be a list of names, e.g. ["orders:read"] or ["*"]',
      'Statement 1, condition 1: op must be one of eq, ne, in, not_in, contains, exists, gt, gte, lt, lte',
    ]);
  });
});
