import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { renderTyped } from '../../../../shared/util/path';
import { jsonSettingErrors, parseJsonObject, parseJsonValue } from '../../../../shared/util/json-setting';
import { isValidStatusCode, responseHeaderIssues, toWorkflowResponse } from '../../domain/workflow-response';
import { TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/**
 * Decides what the API caller receives. In a synchronous endpoint the response is sent as soon as
 * this step finishes — steps connected after it keep running in the background (e.g. emails).
 */
@Injectable()
export class HttpResponseNode implements WorkflowNode {
  readonly definition = {
    type: 'http.response',
    category: 'response' as const,
    label: 'Return response',
    description: 'Sends the HTTP response to the API caller. Steps after it keep running in the background.',
    icon: 'reply',
    configSchema: [
      { key: 'statusCode', label: 'Status code', kind: 'number' as const, default: 200, required: true, help: '200 OK, 201 Created, 400 Bad request, 404 Not found, 409 Conflict…' },
      { key: 'headers', label: 'Headers', kind: 'json' as const, default: '{}', help: 'e.g. {"cache-control": "no-store"}' },
      { key: 'body', label: 'Body', kind: 'json' as const, default: '{"ok": true}', help: TYPED_JSON_HELP },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = jsonSettingErrors(config, [
      { key: 'headers', label: 'Headers' },
      { key: 'body', label: 'Body', shape: 'any' },
    ]);
    if (config.statusCode !== undefined && !isValidStatusCode(Number(config.statusCode))) errors.push('Status code must be a whole number from 200 to 599');
    try {
      errors.push(...responseHeaderIssues(parseJsonObject(config.headers, 'Headers') ?? {}));
    } catch {
      /* already reported by jsonSettingErrors */
    }
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const statusCode = Number(ctx.config.statusCode ?? 200);
    if (!isValidStatusCode(statusCode)) throw new NonRetryableError(`Status code ${ctx.config.statusCode} is not valid`);
    const headers = renderTyped(parseJsonObject(ctx.config.headers, 'Headers') ?? {}, ctx.data) as Record<string, unknown>;
    const body = renderTyped(parseJsonValue(ctx.config.body, 'Body'), ctx.data);
    const response = toWorkflowResponse(statusCode, headers, body);
    return { outputHandle: 'default', output: response, response };
  }
}
