import { Injectable } from '@nestjs/common';
import { renderTyped } from '../../../../shared/util/path';
import { jsonSettingErrors, parseJsonValue } from '../../../../shared/util/json-setting';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/** Builds a value from templates (map / reshape / combine data) and saves it for later steps. */
@Injectable()
export class SetDataNode implements WorkflowNode {
  readonly definition = {
    type: 'transform.set',
    category: 'transform' as const,
    label: 'Set data',
    description: 'Builds a value (object, list, text…) from request and context data and saves it as context.<name>.',
    icon: 'braces',
    configSchema: [
      saveAsField('data'),
      {
        key: 'value',
        label: 'Value',
        kind: 'json' as const,
        required: true,
        default: '{"customerId": "{{request.body.customerId}}", "items": "{{request.body.items}}"}',
        help: TYPED_JSON_HELP,
      },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig(config: Record<string, unknown>): string[] {
    return [...saveAsErrors(config), ...jsonSettingErrors(config, [{ key: 'value', label: 'Value', shape: 'any' }])];
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const value = renderTyped(parseJsonValue(ctx.config.value, 'Value'), ctx.data) ?? null;
    const saveAs = saveAsKey(ctx.config, 'data');
    return { outputHandle: 'default', output: { savedAs: `context.${saveAs}`, value }, contextPatch: { [saveAs]: value } };
  }
}
