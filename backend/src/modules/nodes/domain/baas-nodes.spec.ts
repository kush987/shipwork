import { Logger } from '@nestjs/common';
import { cronIssues, scheduleIssues, toScheduleSpec } from './schedule-spec';
import { renderTyped } from '../../../shared/util/path';
import { requestFromTrigger, toWorkflowRequest, httpTrigger } from './triggers';
import { sanitizeResponseHeaders } from './workflow-response';
import { HttpResponseNode } from '../implementations/response/http-response.node';
import { SetDataNode } from '../implementations/transform/set-data.node';
import { RunCodeNode } from '../implementations/transform/run-code.node';
import { ConditionNode } from '../implementations/logic/condition.node';
import { TriggerScheduleNode } from '../implementations/trigger/trigger-schedule.node';
import { QuickJsSandbox } from '../../custom-node/infrastructure/quickjs-sandbox';
import { NonRetryableError } from '../../../shared/domain/errors';
import type { ExecutionData, NodeExecutionContext } from './workflow-node.types';

const data = (over: Partial<ExecutionData> = {}): ExecutionData => ({
  trigger: { event: 'http.request', data: {} },
  context: { product: { price: 100, stock: 3 }, items: ['a', 'b'] },
  request: toWorkflowRequest({ method: 'post', path: '/orders', body: { quantity: 2, name: 'Asha' } }),
  shipment: null,
  ...over,
});

const ctx = (config: Record<string, unknown>, over: Partial<ExecutionData> = {}): NodeExecutionContext => ({
  tenantId: 't',
  executionId: 'ex',
  nodeId: 'n',
  idempotencyKey: 'ex:n',
  attempt: 1,
  isFinalAttempt: true,
  config,
  data: data(over),
  logger: new Logger('test'),
});

describe('schedule spec', () => {
  it('accepts intervals of a minute or more and well-formed cron', () => {
    expect(scheduleIssues({ mode: 'interval', every: 15, unit: 'minutes' })).toEqual([]);
    expect(scheduleIssues({ mode: 'interval', every: 0, unit: 'minutes' })[0]).toContain('above 0');
    expect(toScheduleSpec({ mode: 'interval', every: 2, unit: 'hours' })).toEqual({ kind: 'interval', everyMs: 7_200_000, label: 'every 2 hours' });
    expect(cronIssues('0 9 * * 1-5')).toEqual([]);
    expect(cronIssues('*/15 0-23/2 1,15 * 0')).toEqual([]);
    expect(cronIssues('0 9 * *')[0]).toContain('5 fields');
    expect(cronIssues('61 9 * * *')[0]).toContain('minute');
    expect(cronIssues('0 9 * * MON')[0]).toContain('day of week');
    expect(toScheduleSpec({ mode: 'cron', cron: ' 0  9 * * 1 ' })).toMatchObject({ kind: 'cron', pattern: '0 9 * * 1' });
    expect(new TriggerScheduleNode().validateConfig({ mode: 'cron', cron: 'bad' })).toHaveLength(1);
  });
});

describe('typed templates and requests', () => {
  it('keeps the type of a sole placeholder and renders text otherwise', () => {
    expect(renderTyped({ q: '{{request.body.quantity}}', p: '{{context.product}}', t: 'x{{request.body.quantity}}', m: '{{nope}}' }, data())).toEqual({
      q: 2,
      p: { price: 100, stock: 3 },
      t: 'x2',
      m: null,
    });
  });

  it('strips credentials from requests and reads them back from the trigger', () => {
    const request = toWorkflowRequest({ headers: { Authorization: 'Bearer x', 'X-Api-Key': 'k', Cookie: 'c', 'X-Trace': ['a', 'b'] } });
    expect(request.headers).toEqual({ 'x-trace': 'a, b' });
    expect(requestFromTrigger(httpTrigger(request, {}))).toBe(request);
    expect(requestFromTrigger({ event: 'shipment.created', data: { request } })).toBeNull();
  });

  it('only sends safe response headers', () => {
    expect(sanitizeResponseHeaders({ 'Content-Length': '1', 'X-Ok': 'a\r\nb', 'bad header': 'x', 'cache-control': 'no-store' })).toEqual({
      'x-ok': 'a b',
      'cache-control': 'no-store',
    });
  });
});

describe('BaaS nodes', () => {
  it('Return response builds a typed response', async () => {
    const node = new HttpResponseNode();
    const result = await node.execute(ctx({ statusCode: 201, headers: '{"X-Id": "{{request.body.name}}"}', body: '{"qty": "{{request.body.quantity}}", "ok": true}' }));
    expect(result.response).toEqual({ statusCode: 201, headers: { 'x-id': 'Asha' }, body: { qty: 2, ok: true } });
    expect(node.validateConfig({ statusCode: 99, headers: '{"Connection": "x"}', body: '{bad' })).toEqual([
      'Body is not valid JSON',
      'Status code must be a whole number from 200 to 599',
      expect.stringContaining('set by the server'),
    ]);
  });

  it('Set data saves a computed value under the chosen name', async () => {
    const result = await new SetDataNode().execute(ctx({ saveAs: 'order', value: { qty: '{{request.body.quantity}}', who: 'Hi {{request.body.name}}' } }));
    expect(result.contextPatch).toEqual({ order: { qty: 2, who: 'Hi Asha' } });
    expect(new SetDataNode().validateConfig({ saveAs: 'rates', value: '{}' })[0]).toContain('built-in');
  });

  it('Run code computes in the sandbox and fails without retry on errors', async () => {
    const node = new RunCodeNode(new QuickJsSandbox());
    const ok = await node.execute(
      ctx({ saveAs: 'pricing', code: 'function run({ request, context }) { console.log("hi"); return { total: context.product.price * request.body.quantity }; }' }),
    );
    expect(ok).toMatchObject({ outputHandle: 'success', contextPatch: { pricing: { total: 200 } }, output: { logs: ['hi'] } });
    await expect(node.execute(ctx({ code: 'function run() { throw new Error("nope"); }' }))).rejects.toBeInstanceOf(NonRetryableError);
    expect(node.validateConfig({ code: 'function run( {' })[0]).toContain('syntax error');
    expect(node.validateConfig({ code: 'const x = 1;' })[0]).toContain('function run');
  });

  it('Condition accepts request.* fields', async () => {
    const node = new ConditionNode(new QuickJsSandbox());
    expect(node.validateConfig({ field: 'request.body.quantity', operator: 'lte', value: '{{context.product.stock}}' })).toEqual([]);
    expect(node.validateConfig({ field: 'body.quantity', operator: 'eq', value: 1 })[0]).toContain('request.');
    expect((await node.execute(ctx({ field: 'request.body.quantity', operator: 'lte', value: '{{context.product.stock}}' }))).outputHandle).toBe('true');
  });
});
