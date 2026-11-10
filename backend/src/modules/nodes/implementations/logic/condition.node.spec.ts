import { Logger } from '@nestjs/common';
import { ConditionNode } from './condition.node';
import { QuickJsSandbox } from '../../../custom-node/infrastructure/quickjs-sandbox';
import { toWorkflowRequest } from '../../domain/triggers';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { WorkflowValidator } from '../../../workflow/domain/workflow-validator';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';

const ctx = (config: Record<string, unknown>): NodeExecutionContext => ({
  tenantId: 't',
  executionId: 'ex',
  nodeId: 'n',
  idempotencyKey: 'ex:n',
  attempt: 1,
  isFinalAttempt: true,
  config,
  data: {
    trigger: { event: 'http.request', data: {} },
    context: { order: { total: 6200, status: 'PAID', tags: ['gift'] } },
    request: toWorkflowRequest({ method: 'post', path: '/orders', body: { coupon: '', country: 'IN' }, auth: { type: 'jwt', id: 'u1', roles: ['vip'], claims: {}, context: {} } }),
    shipment: null,
  },
  logger: new Logger('test'),
});

describe('Condition', () => {
  const node = new ConditionNode(new QuickJsSandbox());
  const outcome = async (config: Record<string, unknown>) => (await node.execute(ctx(config))).outputHandle;

  it('still runs a single condition saved before rule lists, with the same output', async () => {
    const result = await node.execute(ctx({ field: 'context.order.total', operator: 'gt', value: '5000' }));
    expect(result).toEqual({
      outputHandle: 'true',
      output: { field: 'context.order.total', actual: 6200, operator: 'gt', expected: '5000', result: true },
    });
  });

  it('needs every condition by default (AND), one with Match: any (OR)', async () => {
    const config = {
      mode: 'rules',
      field: 'context.order.total',
      operator: 'gt',
      value: '5000',
      conditions: [
        { field: 'request.body.country', operator: 'in', value: 'IN, LK' },
        { field: 'context.order.status', operator: 'eq', value: 'refunded' },
      ],
    };
    expect(await outcome(config)).toBe('false');
    expect(await outcome({ ...config, match: 'any' })).toBe('true');
    const { output } = await node.execute(ctx({ ...config, match: 'all' }));
    expect(output).toMatchObject({
      match: 'all',
      result: false,
      conditions: [{ field: 'context.order.total', result: true }, { field: 'request.body.country', result: true }, { field: 'context.order.status', result: false }],
    });
  });

  it('checks a JavaScript expression in the sandbox', async () => {
    const expression = "context.order.total > 5000 && request.auth.roles.includes('vip') && !request.body.coupon";
    const result = await node.execute(ctx({ mode: 'expression', expression }));
    expect(result).toEqual({ outputHandle: 'true', output: { expression, value: true, result: true } });
    expect(await outcome({ mode: 'expression', expression: 'context.order.tags.length > 3' })).toBe('false');
    const failing = node.execute(ctx({ mode: 'expression', expression: 'context.nope.deeper' }));
    await expect(failing).rejects.toThrow(NonRetryableError);
    await expect(failing).rejects.toThrow(/^Expression failed: /);
  });

  it('reports problems with every condition before publishing', () => {
    expect(node.validateConfig({ field: 'request.body.quantity', operator: 'lte', value: '{{context.product.stock}}' })).toEqual([]);
    expect(
      node.validateConfig({
        field: 'context.order.total',
        operator: 'between',
        value: '100',
        match: 'most',
        conditions: [{ field: 'order.status', operator: 'eq' }, { operator: 'is_empty' }, { field: 'context.x', operator: 'after', value: 'tomorrow' }, 'nope'],
      }),
    ).toEqual([
      'Between needs “min, max” — numbers or dates, e.g. 100, 500 or now-30d, now',
      'Match must be all or any',
      'Condition 2: value is required for this operator',
      'Condition 2: field must start with request., context., trigger. or shipment.',
      'Condition 3: field is required',
      'Condition 4: before / after need a date (2026-01-31), now, or now-7d (s, m, h, d, w)',
      'Condition 5 must be {"field", "operator", "value"}',
    ]);
    expect(node.validateConfig({ mode: 'expression', expression: 'context.order.total >' })[0]).toMatch(/^Expression has a syntax error/);
    expect(node.validateConfig({ mode: 'expression', expression: "request.auth.roles.includes('vip')" })).toEqual([]);
  });

  it('requires only the settings of the chosen mode', () => {
    const validator = new WorkflowValidator({ get: (type: string) => (type === 'logic.condition' ? node : undefined) } as never);
    const step = (config: Record<string, unknown>) => ({ nodes: [{ id: 'c', type: 'logic.condition', name: 'Check', position: { x: 0, y: 0 }, config }], edges: [] });
    const required = (config: Record<string, unknown>) =>
      validator.validate(step(config)).filter((i) => i.message.includes('is required')).map((i) => i.message);
    expect(required({ mode: 'expression', expression: 'true' })).toEqual([]);
    expect(required({ mode: 'expression' })).toEqual(['Check: "Expression" is required']);
    expect(required({ operator: 'exists' })).toEqual(['Check: "Field" is required']);
  });
});
