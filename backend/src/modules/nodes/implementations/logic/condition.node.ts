import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { parseJsonValue, isPlainObject } from '../../../../shared/util/json-setting';
import { getPath, renderTemplate } from '../../../../shared/util/path';
import { evaluateCondition, toTime } from '../../domain/condition-evaluator';
import { startsAtDataRoot } from '../../domain/node-config';
import { CONDITION_OPERATORS } from '../../domain/condition-evaluator.constants';
import { ConditionOperator, ConditionRule } from '../../domain/condition-evaluator.types';
import { DATA_ROOTS_TEXT } from '../../domain/node-config.constants';
import { CodeSandbox } from '../../../custom-node/application/code-sandbox.ports';
import { SandboxError } from '../../../custom-node/application/code-sandbox';
import { ConfigField, NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';
import { CONDITION_MODES, EXPRESSION_EXAMPLE, MATCH_MODES, MAX_MORE_CONDITIONS, VALUELESS } from './condition.node.constants';

const rulesMode = { key: 'mode', values: ['rules'] };
const operatorOptions = CONDITION_OPERATORS.map((o) => ({ ...o }));
const ROOTS = DATA_ROOTS_TEXT.replace(/, (?=[^,]*$)/, ' or ');
const isTemplate = (v: unknown) => typeof v === 'string' && v.includes('{{');

const configSchema: ConfigField[] = [
  {
    key: 'mode',
    label: 'Check',
    kind: 'select',
    options: [
      { value: 'rules', label: 'Conditions' },
      { value: 'expression', label: 'JavaScript expression' },
    ],
    // Not required: steps saved before there was a choice have none, and that means conditions.
    default: 'rules',
  },
  {
    key: 'field',
    label: 'Field',
    kind: 'text',
    required: true,
    placeholder: 'request.body.quantity',
    visibleWhen: rulesMode,
    help: `Path into ${DATA_ROOTS_TEXT} — e.g. context.product.stock, context.records.length, or shipment.items.*.sku to match any item`,
  },
  { key: 'operator', label: 'Operator', kind: 'select', options: operatorOptions, default: 'gt', required: true, visibleWhen: rulesMode },
  {
    key: 'value',
    label: 'Value',
    kind: 'text',
    placeholder: '2000',
    visibleWhen: rulesMode,
    help: 'Placeholders work, e.g. {{context.product.stock}}. Between: min, max. Before / after: a date, now, or now-7d (s, m, h, d, w).',
  },
  {
    key: 'conditions',
    label: 'More conditions',
    kind: 'conditions',
    options: operatorOptions,
    visibleWhen: rulesMode,
    help: `Up to ${MAX_MORE_CONDITIONS} more, checked like the one above.`,
  },
  {
    key: 'match',
    label: 'Match',
    kind: 'select',
    options: [
      { value: 'all', label: 'All conditions (AND)' },
      { value: 'any', label: 'Any condition (OR)' },
    ],
    default: 'all',
    visibleWhen: rulesMode,
    help: 'With more than one condition: whether every one must hold, or one is enough.',
  },
  {
    key: 'expression',
    label: 'Expression',
    kind: 'code',
    required: true,
    placeholder: EXPRESSION_EXAMPLE,
    visibleWhen: { key: 'mode', values: ['expression'] },
    help: `JavaScript that is true or false, with request, context, trigger and shipment — e.g. ${EXPRESSION_EXAMPLE}. Runs in the code sandbox.`,
  },
];

/** The rules a config holds: the first (field / operator / value, as steps saved before rule lists had) and the rest. */
function rulesOf(config: Record<string, unknown>): ConditionRule[] {
  const more = parseJsonValue(config.conditions, 'More conditions');
  const first = { field: String(config.field ?? ''), operator: config.operator as ConditionOperator, value: config.value };
  return [first, ...(Array.isArray(more) ? (more.filter(isPlainObject) as unknown as ConditionRule[]) : [])];
}

/** Problems with one rule. The first keeps the messages single-condition steps always had. */
function ruleIssues(rule: Record<string, unknown>, label?: string): string[] {
  const issues: string[] = [];
  const at = (message: string) => (label ? `${label}: ${lowerFirst(message)}` : message);
  const operator = rule.operator as ConditionOperator;
  if (!CONDITION_OPERATORS.some((o) => o.value === operator)) issues.push(at(`Unknown operator '${String(operator)}'`));
  const value = rule.value;
  if (!VALUELESS.includes(operator) && (value === undefined || value === null || value === '')) issues.push(at('Value is required for this operator'));
  else if (!isTemplate(value)) issues.push(...valueShapeIssues(operator, value).map(at));
  if (label && (typeof rule.field !== 'string' || !rule.field)) issues.push(at('Field is required'));
  else if (typeof rule.field === 'string' && rule.field && !startsAtDataRoot(rule.field)) issues.push(at(`Field must start with ${ROOTS}`));
  return issues;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Values that can never match, caught before publishing (placeholders are checked when they run). */
function valueShapeIssues(operator: ConditionOperator, value: unknown): string[] {
  const now = Date.now();
  const isPoint = (v: unknown) => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) || toTime(v, now) !== null;
  if (operator === 'between') {
    const bounds = String(value).split(',').map((s) => s.trim());
    if (bounds.length !== 2 || !bounds.every(isPoint)) return ['Between needs “min, max” — numbers or dates, e.g. 100, 500 or now-30d, now'];
  }
  if ((operator === 'before' || operator === 'after') && toTime(value, now) === null) {
    return ['Before / after need a date (2026-01-31), now, or now-7d (s, m, h, d, w)'];
  }
  return [];
}

/** The sandbox calls `run(input)`; an expression becomes its return value. */
const expressionProgram = (expression: string) => `function run({ request, context, trigger, shipment }) {\n  return (\n${expression}\n  );\n}`;

/**
 * IF / ELSE: one or more field conditions (all or any must hold), or a JavaScript expression for
 * anything the operators can't say.
 */
@Injectable()
export class ConditionNode implements WorkflowNode {
  constructor(private readonly sandbox: CodeSandbox) {}

  readonly definition = {
    type: 'logic.condition',
    category: 'logic' as const,
    label: 'Condition',
    description: 'Branches (IF / ELSE) on one or more conditions — all or any must hold — or on a JavaScript expression.',
    icon: 'git-branch',
    configSchema,
    outputs: [
      { id: 'true', label: 'True' },
      { id: 'false', label: 'False' },
    ],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const mode = config.mode ?? 'rules';
    if (mode === 'expression') return this.expressionIssues(config.expression);
    if (!(CONDITION_MODES as readonly unknown[]).includes(mode)) return ['“Check” must be conditions or a JavaScript expression'];
    const issues = ruleIssues(config);
    if (config.match !== undefined && !(MATCH_MODES as readonly unknown[]).includes(config.match)) issues.push('Match must be all or any');
    let more: unknown;
    try {
      more = parseJsonValue(config.conditions, 'More conditions');
    } catch (error) {
      return [...issues, (error as Error).message];
    }
    if (more === undefined) return issues;
    if (!Array.isArray(more)) return [...issues, 'More conditions must be a list of {"field", "operator", "value"}'];
    if (more.length > MAX_MORE_CONDITIONS) return [...issues, `A step can have at most ${MAX_MORE_CONDITIONS} more conditions`];
    more.forEach((rule, i) => {
      const label = `Condition ${i + 2}`;
      if (!isPlainObject(rule)) issues.push(`${label} must be {"field", "operator", "value"}`);
      else issues.push(...ruleIssues(rule, label));
    });
    return issues;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    if (ctx.config.mode === 'expression') return this.runExpression(ctx);
    const now = Date.now();
    const checked = rulesOf(ctx.config).map(({ field, operator, value }) => {
      const expected = typeof value === 'string' ? renderTemplate(value, ctx.data) : value;
      const actual = getPath(ctx.data, field);
      return { field, actual: actual ?? null, operator, expected: expected ?? null, result: evaluateCondition(actual, operator, expected, now) };
    });
    const match = ctx.config.match === 'any' ? 'any' : 'all';
    const result = match === 'any' ? checked.some((c) => c.result) : checked.every((c) => c.result);
    // One condition keeps the output it always had; several show each one's outcome.
    const output = checked.length === 1 ? checked[0] : { match, result, conditions: checked };
    return { outputHandle: result ? 'true' : 'false', output };
  }

  private expressionIssues(expression: unknown): string[] {
    const text = typeof expression === 'string' ? expression.trim() : '';
    if (!text) return [];
    try {
      // Parses only — the expression runs in the sandbox at execution time.
      new Function('request', 'context', 'trigger', 'shipment', `return (\n${text}\n);`);
    } catch (error) {
      return [`Expression has a syntax error: ${(error as Error).message}`];
    }
    return [];
  }

  private async runExpression(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const expression = String(ctx.config.expression ?? '').trim();
    if (!expression) throw new NonRetryableError(`Write an expression, e.g. ${EXPRESSION_EXAMPLE}`);
    const { request, context, trigger, shipment } = ctx.data;
    try {
      const { value, logs } = await this.sandbox.run(expressionProgram(expression), { request, context, trigger, shipment });
      logs.forEach((line) => ctx.logger.log(`[expression] ${line}`));
      const result = Boolean(value);
      return { outputHandle: result ? 'true' : 'false', output: { expression, value: value ?? null, result } };
    } catch (error) {
      // A mistake in the expression won't fix itself on retry.
      if (error instanceof SandboxError) throw new NonRetryableError(`Expression failed: ${error.message}`);
      throw error;
    }
  }
}
