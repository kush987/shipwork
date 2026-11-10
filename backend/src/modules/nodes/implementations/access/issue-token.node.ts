import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { renderTyped } from '../../../../shared/util/path';
import { jsonSettingErrors, parseJsonObject } from '../../../../shared/util/json-setting';
import { TokenService } from '../../../app-auth/application/token.service';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { TEMPLATE_HELP, TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { rolesSetting, textSetting } from './access.helpers';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/**
 * Signs a token for a user of the workspace's app (a ShipFlow-issued sign-in provider). Endpoints
 * with JWT auth and that provider accept it; the user id becomes request.auth.id there.
 */
@Injectable()
export class IssueTokenNode implements WorkflowNode {
  constructor(private readonly tokens: TokenService) {}

  readonly definition = {
    type: 'auth.issue_token',
    category: 'access' as const,
    label: 'Issue token',
    description: 'Signs a sign-in token for a user (Login APIs). JWT endpoints using the same provider accept it.',
    icon: 'key-round',
    configSchema: [
      { key: 'provider', label: 'Sign-in provider', kind: 'select' as const, optionsSource: 'auth-providers' as const, required: true, help: 'A ShipFlow-issued provider (Settings → App sign-in)' },
      { key: 'subject', label: 'User id', kind: 'text' as const, required: true, placeholder: '{{context.user.id}}', help: TEMPLATE_HELP },
      { key: 'roles', label: 'Roles', kind: 'text' as const, default: '{{context.user.roles}}', help: 'A list placeholder or comma-separated role names' },
      { key: 'claims', label: 'Extra claims', kind: 'json' as const, default: '{}', help: `e.g. {"email": "{{context.user.email}}"}. ${TYPED_JSON_HELP}` },
      { key: 'expiresInMinutes', label: 'Expires in (minutes)', kind: 'number' as const, help: 'Empty: the provider’s token lifetime' },
      saveAsField('session', 'context.<name>.token and .expiresAt'),
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig(config: Record<string, unknown>): string[] {
    return [...saveAsErrors(config), ...jsonSettingErrors(config, [{ key: 'claims', label: 'Extra claims' }])];
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const sub = textSetting(ctx, 'subject');
    if (!sub) throw new NonRetryableError('The user id is empty — check the placeholder');
    const claims = (renderTyped(parseJsonObject(ctx.config.claims, 'Extra claims') ?? {}, ctx.data) as Record<string, unknown>) ?? {};
    const minutes = Number(ctx.config.expiresInMinutes) || undefined;
    const { token, expiresAt } = await this.tokens.issue(ctx.tenantId, String(ctx.config.provider ?? ''), { sub, roles: rolesSetting(ctx, 'roles'), claims, expiresInMinutes: minutes }).catch((error) => {
      throw new NonRetryableError((error as Error).message);
    });
    const saveAs = saveAsKey(ctx.config, 'session');
    return { outputHandle: 'default', output: { sub, expiresAt, savedAs: `context.${saveAs}` }, contextPatch: { [saveAs]: { token, tokenType: 'Bearer', expiresAt } } };
  }
}
