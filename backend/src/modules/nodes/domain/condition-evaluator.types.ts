import { CONDITION_OPERATORS } from './condition-evaluator.constants';

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]['value'];

/** One condition: a field, how it is compared, and what with (a template). */
export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}
