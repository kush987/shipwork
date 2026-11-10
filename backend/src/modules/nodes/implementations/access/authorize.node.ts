import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { renderTyped } from '../../../../shared/util/path';
import { parseJsonObject } from '../../../../shared/util/json-setting';
import { evaluatePolicy, policyIssues } from '../../../../shared/policy/policy';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { TEMPLATE_HELP } from '../../domain/node-config.constants';
import { DEFAULT_POLICY, POLICY_HELP } from './access.constants';
import { isPlaceholder, rolesSetting, textSetting } from './access.helpers';
import type { Policy } from '../../../../shared/policy/policy.types';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/**
 * Checks a policy for the caller: may these roles do `action` on `resource`? The policy can be
 * written here or come from data ("{{context.policy}}"), so permissions are managed without code.
 */
@Injectable()
export class AuthorizeNode implements WorkflowNode {
  readonly definition = {
    type: 'auth.authorize',
    category: 'access' as const,
    label: 'Authorize',
    description: 'Checks a policy: may the caller (their roles) do this action on this resource? Continues on Allowed or Denied.',
    icon: 'shield-check',
    configSchema: [
      { key: 'action', label: 'Action', kind: 'text' as const, required: true, placeholder: 'orders:cancel', help: 'What the caller wants to do — any name you use in the policy' },
      { key: 'resource', label: 'Resource', kind: 'text' as const, default: '*', placeholder: 'order:{{request.params.id}}', help: TEMPLATE_HELP },
      { key: 'roles', label: 'Caller roles', kind: 'text' as const, default: '{{request.auth.roles}}', help: 'A list placeholder or comma-separated role names' },
      { key: 'policy', label: 'Policy', kind: 'json' as const, required: true, default: DEFAULT_POLICY, help: POLICY_HELP },
      saveAsField('access', 'The decision: context.<name>.allowed / .reason'),
    ],
    outputs: [
      { id: 'allowed', label: 'Allowed' },
      { id: 'denied', label: 'Denied' },
    ],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = saveAsErrors(config);
    if (!String(config.action ?? '').trim()) errors.push('Name the action, e.g. orders:cancel');
    // A policy that is one placeholder ("{{context.policy}}") comes from data: it is checked when the step runs.
    if (isPlaceholder(config.policy)) return errors;
    try {
      errors.push(...policyIssues(parseJsonObject(config.policy, 'Policy')));
    } catch (error) {
      errors.push((error as Error).message);
    }
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const source = ctx.config.policy;
    // Written as JSON text (builder) or as an object (templates); or one placeholder for a policy kept in data.
    const policy = renderTyped(isPlaceholder(source) ? String(source).trim() : parseJsonObject(source, 'Policy'), ctx.data) as Policy;
    const issues = policyIssues(policy);
    if (issues.length) throw new NonRetryableError(`The policy is not valid: ${issues[0]}`);
    const request = { action: textSetting(ctx, 'action'), resource: textSetting(ctx, 'resource') || '*', roles: rolesSetting(ctx, 'roles') };
    const decision = evaluatePolicy(policy, request);
    const saveAs = saveAsKey(ctx.config, 'access');
    return {
      outputHandle: decision.allowed ? 'allowed' : 'denied',
      output: { ...decision, ...request },
      contextPatch: { [saveAs]: { ...decision, ...request } },
    };
  }
}
