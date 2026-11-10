import { CONDITION_OPS } from './policy.constants';

export type ConditionOp = (typeof CONDITION_OPS)[number];

/** `left <op> right`, compared after {{placeholders}} are filled in. */
export interface PolicyCondition {
  left: unknown;
  op: ConditionOp;
  right?: unknown;
}

/**
 * One rule. It matches a request when the action and the resource match one of its patterns
 * (`*` matches anything), the caller has one of its roles (when roles are listed), and every
 * `when` condition holds.
 */
export interface PolicyStatement {
  effect: 'allow' | 'deny';
  actions: string[];
  resources: string[];
  roles?: string[];
  when?: PolicyCondition[];
  /** Shown in decisions, e.g. "customers read their own orders". */
  description?: string;
}

export interface Policy {
  statements: PolicyStatement[];
}

export interface AccessRequest {
  action: string;
  resource: string;
  roles: string[];
}

export interface AccessDecision {
  allowed: boolean;
  /** Why, in plain words — for the run timeline and 403 messages. */
  reason: string;
  /** Index of the statement that decided it (deny or allow), if any. */
  statement: number | null;
}
