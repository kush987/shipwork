import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { OutboundHttp } from '../../../../shared/http/outbound-http';
import { jsonSettingErrors, parseJsonObject } from '../../../../shared/util/json-setting';
import { asStep, assertHttpSuccess } from '../../domain/step-errors';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { runFetch } from './fetch-data';
import { IDENTIFIER, TEMPLATE_HELP } from '../../domain/node-config.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/**
 * Calls an API and stores chosen fields under context[saveAs] for the following steps
 * ({{context.<saveAs>.<field>}} in text, context.<saveAs>.<field> in conditions).
 */
@Injectable()
export class FetchDataNode implements WorkflowNode {
  constructor(private readonly http: OutboundHttp) {}

  readonly definition = {
    type: 'integration.fetch',
    category: 'integration' as const,
    label: 'Fetch data (API)',
    description: 'Calls an API and saves fields from the response for the next steps to use.',
    icon: 'webhook',
    configSchema: [
      {
        key: 'method',
        label: 'Method',
        kind: 'select' as const,
        default: 'GET',
        required: true,
        options: ['GET', 'POST', 'PUT', 'PATCH'].map((m) => ({ value: m, label: m })),
      },
      {
        key: 'url',
        label: 'URL',
        kind: 'text' as const,
        required: true,
        placeholder: 'https://api.postalpincode.in/pincode/{{shipment.deliveryPincode}}',
        help: TEMPLATE_HELP,
      },
      { key: 'query', label: 'Query parameters', kind: 'json' as const, default: '{}', help: 'e.g. {"phone": "{{shipment.customer.phone}}"}' },
      { key: 'headers', label: 'Headers', kind: 'json' as const, default: '{}', help: 'e.g. {"Authorization": "Bearer …"}' },
      { key: 'body', label: 'Body (POST/PUT/PATCH)', kind: 'json' as const, default: '{}' },
      saveAsField('apiData'),
      {
        key: 'extract',
        label: 'Extract fields',
        kind: 'json' as const,
        default: '{}',
        help: '{"fieldName": "body.path.to.value"} — leave {} to save the whole { status, body }. Use “Test request” to pick fields.',
      },
      { key: 'failIfMissing', label: 'Fail if an extracted field is missing', kind: 'boolean' as const, default: false },
      { key: 'timeoutMs', label: 'Timeout (ms)', kind: 'number' as const, default: 8000 },
    ],
    outputs: [
      { id: 'success', label: 'Fetched' },
      { id: 'failed', label: 'Failed' },
    ],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = [
      ...saveAsErrors(config),
      ...jsonSettingErrors(config, [
        { key: 'query', label: 'Query parameters' },
        { key: 'headers', label: 'Headers' },
        { key: 'body', label: 'Body' },
        { key: 'extract', label: 'Extract fields' },
      ]),
    ];
    const url = String(config.url ?? '');
    if (url && !/^(https?:\/\/|\{\{)/.test(url)) errors.push('URL must start with http:// or https://');
    // Report every problem at once: extract paths are checked whenever the extract JSON itself parses.
    try {
      errors.push(...extractErrors(parseJsonObject(config.extract, 'Extract fields') ?? {}));
    } catch {
      /* already reported by jsonSettingErrors */
    }
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const { request, response, saved, missing } = await asStep(() => runFetch(this.http, ctx.config, ctx.data));
    const summary = `${request.method} ${new URL(request.url).host} → ${response.status}`;
    assertHttpSuccess(response, summary);
    if (ctx.config.failIfMissing && missing.length) {
      throw new NonRetryableError(`${summary}, but the response has no ${missing.join(', ')}`);
    }
    const saveAs = saveAsKey(ctx.config, 'apiData');
    return {
      outputHandle: 'success',
      output: { request, status: response.status, durationMs: response.durationMs, savedAs: `context.${saveAs}`, saved, ...(missing.length ? { missing } : {}) },
      contextPatch: { [saveAs]: saved },
    };
  }
}

function extractErrors(extract: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [field, path] of Object.entries(extract)) {
    if (!IDENTIFIER.test(field)) errors.push(`Extract field name “${field}” must be a letter followed by letters, digits or _`);
    if (typeof path !== 'string' || !/^(status|headers|body)(\.|$)/.test(path)) {
      errors.push(`Extract path for “${field}” must start with body., headers. or status`);
    }
  }
  return errors;
}
