import { escapeRegExp, isEqual } from 'lodash';
import { CONDITION_OPS, MAX_STATEMENTS } from './policy.constants';
import type { AccessDecision, AccessRequest, Policy, PolicyCondition, PolicyStatement } from './policy.types';

const toRegExp = (pattern: string) => new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);

/** `orders:*` matches `orders:read`; `order:42*` matches `order:42`; `*` matches everything. */
export const matchesPattern = (pattern: string, value: string) => pattern === '*' || toRegExp(pattern).test(value);

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const compare = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));
const same = (a: unknown, b: unknown) => isEqual(a, b) || (a !== null && b !== null && a !== undefined && b !== undefined && String(a) === String(b));

export function conditionHolds({ left, op, right }: PolicyCondition): boolean {
  switch (op) {
    case 'eq':
      return same(left, right);
    case 'ne':
      return !same(left, right);
    case 'in':
      return asList(right).some((r) => same(left, r));
    case 'not_in':
      return !asList(right).some((r) => same(left, r));
    case 'contains':
      return Array.isArray(left) ? left.some((l) => same(l, right)) : String(left ?? '').includes(String(right ?? ''));
    case 'exists':
      return (left !== undefined && left !== null && left !== '') === (right === undefined ? true : !!right);
    case 'gt':
      return left !== undefined && compare(left, right) > 0;
    case 'gte':
      return left !== undefined && compare(left, right) >= 0;
    case 'lt':
      return left !== undefined && compare(left, right) < 0;
    case 'lte':
      return left !== undefined && compare(left, right) <= 0;
  }
}

const statementMatches = (s: PolicyStatement, req: AccessRequest) =>
  s.actions.some((p) => matchesPattern(p, req.action)) &&
  s.resources.some((p) => matchesPattern(p, req.resource)) &&
  (!s.roles?.length || s.roles.some((role) => req.roles.includes(role))) &&
  (s.when ?? []).every(conditionHolds);

const label = (s: PolicyStatement, index: number) => (s.description ? `“${s.description}”` : `statement ${index + 1}`);

/**
 * Default deny; an explicit deny always wins over any allow (the same rules as AWS IAM), so a
 * broad allow can be narrowed safely with a deny.
 */
export function evaluatePolicy(policy: Policy, req: AccessRequest): AccessDecision {
  const matching = policy.statements.map((s, i) => [s, i] as const).filter(([s]) => statementMatches(s, req));
  const deny = matching.find(([s]) => s.effect === 'deny');
  if (deny) return { allowed: false, reason: `Denied by ${label(...deny)}`, statement: deny[1] };
  const allow = matching.find(([s]) => s.effect === 'allow');
  if (allow) return { allowed: true, reason: `Allowed by ${label(...allow)}`, statement: allow[1] };
  return { allowed: false, reason: `No statement allows ${req.action} on ${req.resource}`, statement: null };
}

const isStringList = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.length > 0);

/** Problems with a policy as authored (before placeholders are filled in). */
export function policyIssues(raw: unknown): string[] {
  const statements = (raw as Policy | null)?.statements;
  if (!Array.isArray(statements)) return ['A policy is { "statements": [ … ] }'];
  if (!statements.length) return ['Add at least one statement'];
  if (statements.length > MAX_STATEMENTS) return [`A policy can have at most ${MAX_STATEMENTS} statements`];
  const issues: string[] = [];
  statements.forEach((s: Partial<PolicyStatement>, i) => {
    const where = `Statement ${i + 1}`;
    if (s?.effect !== 'allow' && s?.effect !== 'deny') issues.push(`${where}: effect must be "allow" or "deny"`);
    if (!isStringList(s?.actions)) issues.push(`${where}: actions must be a list of names, e.g. ["orders:read"] or ["*"]`);
    if (!isStringList(s?.resources)) issues.push(`${where}: resources must be a list, e.g. ["order:{{request.params.id}}"] or ["*"]`);
    if (s?.roles !== undefined && !Array.isArray(s.roles)) issues.push(`${where}: roles must be a list`);
    if (s?.when !== undefined) {
      if (!Array.isArray(s.when)) issues.push(`${where}: when must be a list of conditions`);
      else s.when.forEach((c, j) => !(CONDITION_OPS as readonly string[]).includes((c as PolicyCondition)?.op) && issues.push(`${where}, condition ${j + 1}: op must be one of ${CONDITION_OPS.join(', ')}`));
    }
  });
  return issues;
}
