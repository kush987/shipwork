import { Injectable } from '@nestjs/common';
import { renderTyped } from '../../../../shared/util/path';
import { jsonSettingErrors, parseJsonObject } from '../../../../shared/util/json-setting';
import { ACCESS_DECISION_HEADER } from '../../domain/access-decision.constants';
import { TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { textSetting } from './access.helpers';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/**
 * The answer of an authorizer workflow: allow the call (optionally passing context on to the
 * endpoint's workflow as request.auth.context) or deny it with 401/403 and a message.
 */
@Injectable()
export class AccessDecisionNode implements WorkflowNode {
  readonly definition = {
    type: 'auth.decision',
    category: 'access' as const,
    label: 'Access decision',
    description: 'Ends an authorizer workflow: allow the API call (and pass context on) or deny it with a message.',
    icon: 'badge-check',
    configSchema: [
      {
        key: 'decision',
        label: 'Decision',
        kind: 'select' as const,
        options: [
          { value: 'allow', label: 'Allow the call' },
          { value: 'deny', label: 'Deny the call' },
        ],
        default: 'allow',
        required: true,
      },
      { key: 'statusCode', label: 'Status when denied', kind: 'number' as const, default: 403, help: '403 Forbidden, or 401 to ask the caller to sign in again' },
      { key: 'message', label: 'Message when denied', kind: 'text' as const, default: 'You do not have access to this', help: 'Shown to the caller' },
      { key: 'context', label: 'Context when allowed', kind: 'json' as const, default: '{}', help: `Given to the endpoint's workflow as request.auth.context. ${TYPED_JSON_HELP}` },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = jsonSettingErrors(config, [{ key: 'context', label: 'Context' }]);
    const status = Number(config.statusCode ?? 403);
    if (config.decision === 'deny' && (!Number.isInteger(status) || status < 400 || status > 499)) errors.push('Status when denied must be 400–499 (usually 401 or 403)');
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const allow = ctx.config.decision !== 'deny';
    const context = allow ? ((renderTyped(parseJsonObject(ctx.config.context, 'Context') ?? {}, ctx.data) as Record<string, unknown>) ?? {}) : {};
    const message = textSetting(ctx, 'message') || 'Access denied';
    const statusCode = allow ? 200 : Number(ctx.config.statusCode ?? 403);
    return {
      outputHandle: 'default',
      output: allow ? { decision: 'allow', context } : { decision: 'deny', statusCode, message },
      response: {
        statusCode,
        headers: { [ACCESS_DECISION_HEADER]: allow ? 'allow' : 'deny' },
        body: allow ? { decision: 'allow', context } : { decision: 'deny', message },
      },
    };
  }
}
