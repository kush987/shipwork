import { VALUELESS_OPERATORS } from '../../domain/condition-evaluator.constants';

/** Operators that take no value. */
export const VALUELESS = VALUELESS_OPERATORS;

/** How a Condition step decides: field rules, or a JavaScript expression. */
export const CONDITION_MODES = ['rules', 'expression'] as const;

/** Whether every rule must hold (AND) or one is enough (OR). */
export const MATCH_MODES = ['all', 'any'] as const;

/** Rules a step may add below its first one. */
export const MAX_MORE_CONDITIONS = 10;

export const EXPRESSION_EXAMPLE = "context.order.total > 5000 && request.auth.roles.includes('vip')";
