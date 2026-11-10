import { isPlainObject } from 'lodash';
import { saveAsKey } from './node-config';
import { LITERALS_KEY, MAX_STEP_LOGIC_LENGTH, NO_LOGIC_CUSTOM, NO_LOGIC_REASON, NO_LOGIC_TRIGGER, STEP_LOGIC_HOOKS } from './step-logic.constants';
import type { NodeTypeDefinition } from './workflow-node.types';
import type { StepLogic } from '../../workflow/domain/workflow-definition.types';

/** True when the step carries any before()/after() code. */
export const hasStepLogic = (logic: StepLogic | undefined): logic is StepLogic => !!(logic?.before?.trim() || logic?.after?.trim());

/** Why this kind of step can't have logic, or null when it can. */
export function noLogicReason(definition: Pick<NodeTypeDefinition, 'type' | 'isTrigger' | 'custom'>): string | null {
  if (definition.isTrigger) return NO_LOGIC_TRIGGER;
  if (definition.custom || definition.type.startsWith('custom.')) return NO_LOGIC_CUSTOM;
  return NO_LOGIC_REASON[definition.type] ?? null;
}

/** Problems with a step's logic, for the workflow validator (code is parsed here, never run). */
export function stepLogicIssues(logic: StepLogic | undefined, definition: Pick<NodeTypeDefinition, 'type' | 'isTrigger' | 'custom'>): string[] {
  if (!hasStepLogic(logic)) return [];
  const notHere = noLogicReason(definition);
  if (notHere) return [notHere];
  const issues: string[] = [];
  for (const hook of STEP_LOGIC_HOOKS) {
    const code = logic[hook]?.trim();
    if (!code) continue;
    if (code.length > MAX_STEP_LOGIC_LENGTH) issues.push(`${hook}() logic is too long (at most ${MAX_STEP_LOGIC_LENGTH} characters)`);
    if (!new RegExp(`\\bfunction\\s+${hook}\\s*\\(|\\b(?:const|let|var)\\s+${hook}\\s*=`).test(code)) {
      issues.push(`Logic must define \`function ${hook}(input) { … }\``);
    }
    try {
      new Function(code);
    } catch (error) {
      issues.push(`${hook}() logic has a syntax error: ${(error as Error).message}`);
    }
  }
  return issues;
}

/** Where the step saves its result (its "Save result as" setting), or null when it has none. */
export function savedKeyOf(definition: Pick<NodeTypeDefinition, 'configSchema'>, config: Record<string, unknown>): string | null {
  const field = definition.configSchema.find((f) => f.key === 'saveAs');
  return field ? saveAsKey(config, String(field.default ?? '')) || null : null;
}

/**
 * Text with `{{` in it that code returned (often straight from the request) must never be
 * rendered as a placeholder — a caller could read run data that way (`{{context.token}}`). Such
 * text is stored aside and referenced by a placeholder that renders to it exactly once.
 */
export function protectLiterals(value: unknown, literals: string[]): unknown {
  if (typeof value === 'string') {
    if (!value.includes('{{')) return value;
    literals.push(value);
    return `{{${LITERALS_KEY}.${literals.length - 1}}}`;
  }
  if (Array.isArray(value)) return value.map((v) => protectLiterals(v, literals));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, protectLiterals(v, literals)]));
  return value;
}

/** "Error: price must be positive" → "price must be positive" (what fail() was given). */
export const failMessage = (message: string) => message.replace(/^Error:\s*/, '');
