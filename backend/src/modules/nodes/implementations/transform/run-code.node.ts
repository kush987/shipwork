import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { SandboxError } from '../../../custom-node/application/code-sandbox';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { CodeSandbox } from '../../../custom-node/application/code-sandbox.ports';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';
import { RUN_CODE_STARTER } from './run-code.node.constants';

/** Inline JavaScript for logic that is awkward to draw — the "code" half of hybrid workflows. */
@Injectable()
export class RunCodeNode implements WorkflowNode {
  constructor(private readonly sandbox: CodeSandbox) {}

  readonly definition = {
    type: 'code.run',
    category: 'transform' as const,
    label: 'Run code',
    description: 'Runs a JavaScript function in a sandbox and saves what it returns. For calculations and reshaping data.',
    icon: 'code',
    configSchema: [
      { key: 'code', label: 'Code', kind: 'code' as const, required: true, default: RUN_CODE_STARTER },
      saveAsField('result'),
    ],
    outputs: [
      { id: 'success', label: 'Done' },
      { id: 'failed', label: 'Failed' },
    ],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = saveAsErrors(config);
    const code = String(config.code ?? '');
    if (!code.trim()) return errors;
    if (!/\bfunction\s+run\s*\(|\b(?:const|let|var)\s+run\s*=/.test(code)) errors.push('Code must define `function run(input) { … }`');
    try {
      // Parses only — the code is never executed here (it runs in the sandbox at execution time).
      new Function(code);
    } catch (error) {
      errors.push(`Code has a syntax error: ${(error as Error).message}`);
    }
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const { request, context, trigger, shipment } = ctx.data;
    try {
      const { value, logs, durationMs } = await this.sandbox.run(String(ctx.config.code ?? ''), { request, context, trigger, shipment });
      logs.forEach((line) => ctx.logger.log(`[code] ${line}`));
      const saveAs = saveAsKey(ctx.config, 'result');
      return { outputHandle: 'success', output: { result: value, logs, durationMs }, contextPatch: { [saveAs]: value } };
    } catch (error) {
      // A bug in the code won't fix itself on retry.
      if (error instanceof SandboxError) throw new NonRetryableError(`Code failed: ${error.message}${error.logs.length ? ` (logs: ${error.logs.slice(-3).join(' | ')})` : ''}`);
      throw error;
    }
  }
}
