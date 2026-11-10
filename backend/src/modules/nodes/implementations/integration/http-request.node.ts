import { Injectable } from '@nestjs/common';
import { renderDeep, renderTemplate } from '../../../../shared/util/path';
import { OutboundHttp } from '../../../../shared/http/outbound-http';
import { jsonSettingErrors, parseJsonObject, parseJsonValue } from '../../../../shared/util/json-setting';
import { asStep, assertHttpSuccess } from '../../domain/step-errors';
import { TEMPLATE_HELP } from '../../domain/node-config.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

@Injectable()
export class HttpRequestNode implements WorkflowNode {
  constructor(private readonly http: OutboundHttp) {}

  readonly definition = {
    type: 'integration.http',
    category: 'integration' as const,
    label: 'HTTP request',
    description: 'Calls an external API (ERP, OMS, CRM, payment provider…) and continues on 2xx.',
    icon: 'globe',
    configSchema: [
      {
        key: 'method',
        label: 'Method',
        kind: 'select' as const,
        default: 'POST',
        required: true,
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m })),
      },
      { key: 'url', label: 'URL', kind: 'text' as const, required: true, placeholder: 'https://erp.example.com/hooks/shipments', help: TEMPLATE_HELP },
      { key: 'headers', label: 'Headers', kind: 'json' as const, default: '{"content-type":"application/json"}' },
      {
        key: 'body',
        label: 'Body',
        kind: 'json' as const,
        default: '{"orderId":"{{shipment.orderId}}","awb":"{{shipment.awb}}","status":"{{shipment.status}}"}',
      },
      { key: 'timeoutMs', label: 'Timeout (ms)', kind: 'number' as const, default: 10000 },
    ],
    outputs: [
      { id: 'success', label: '2xx' },
      { id: 'failed', label: 'Failed' },
    ],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = jsonSettingErrors(config, [
      { key: 'headers', label: 'Headers' },
      { key: 'body', label: 'Body', shape: 'any' },
    ]);
    if (typeof config.url === 'string' && !/^(https?:\/\/|\{\{)/.test(config.url)) errors.push('URL must start with http(s)://');
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const method = String(ctx.config.method ?? 'POST');
    const url = renderTemplate(String(ctx.config.url), ctx.data);
    const headers = renderDeep(parseJsonObject(ctx.config.headers, 'Headers') ?? {}, ctx.data) as Record<string, string>;
    const body = method === 'GET' ? undefined : renderDeep(parseJsonValue(ctx.config.body, 'Body'), ctx.data);

    const response = await asStep(() =>
      this.http.request({
        method,
        url,
        headers: { 'x-idempotency-key': ctx.idempotencyKey, ...headers },
        body,
        timeoutMs: Number(ctx.config.timeoutMs) || 10_000,
      }),
    );
    assertHttpSuccess(response, `${method} ${url} → ${response.status}`);
    const result = { status: response.status, body: response.body };
    return { outputHandle: 'success', output: result, contextPatch: { lastHttpResponse: result } };
  }
}
