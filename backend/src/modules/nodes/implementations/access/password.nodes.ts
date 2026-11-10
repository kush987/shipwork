import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { hashPassword, verifyPassword } from '../../../../shared/security/passwords';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { TEMPLATE_HELP } from '../../domain/node-config.constants';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { textSetting } from './access.helpers';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/** Turns a password into a salted scrypt hash to store (never store the password itself). */
@Injectable()
export class HashPasswordNode implements WorkflowNode {
  readonly definition = {
    type: 'auth.hash_password',
    category: 'access' as const,
    label: 'Hash password',
    description: 'Turns a password into a secure hash to store with the user — for sign-up and password change APIs.',
    icon: 'lock',
    configSchema: [
      { key: 'password', label: 'Password', kind: 'text' as const, required: true, default: '{{request.body.password}}', help: TEMPLATE_HELP },
      saveAsField('passwordHash', 'Store context.<name> with the user, e.g. passwordHash: "{{context.passwordHash}}"'),
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig = saveAsErrors;

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const password = textSetting(ctx, 'password');
    if (!password) throw new NonRetryableError('The password is empty — check the placeholder');
    const saveAs = saveAsKey(ctx.config, 'passwordHash');
    return { outputHandle: 'default', output: { savedAs: `context.${saveAs}` }, contextPatch: { [saveAs]: await hashPassword(password) } };
  }
}

/** Compares a password with a stored hash in constant time — for login APIs. */
@Injectable()
export class VerifyPasswordNode implements WorkflowNode {
  private readonly decoy = hashPassword('decoy-for-unknown-users');

  readonly definition = {
    type: 'auth.verify_password',
    category: 'access' as const,
    label: 'Check password',
    description: 'Compares a password with the stored hash. Continues on Match or No match (also when the user has no hash).',
    icon: 'lock',
    configSchema: [
      { key: 'password', label: 'Password', kind: 'text' as const, required: true, default: '{{request.body.password}}', help: TEMPLATE_HELP },
      { key: 'hash', label: 'Stored hash', kind: 'text' as const, required: true, placeholder: '{{context.user.passwordHash}}', help: 'The hash the Hash password step produced' },
    ],
    outputs: [
      { id: 'match', label: 'Match' },
      { id: 'no_match', label: 'No match' },
    ],
  };

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const hash = textSetting(ctx, 'hash');
    // Unknown users take as long as wrong passwords, so callers can't probe which emails exist.
    const match = (await verifyPassword(textSetting(ctx, 'password'), hash || (await this.decoy))) && !!hash;
    return { outputHandle: match ? 'match' : 'no_match', output: { match } };
  }
}
