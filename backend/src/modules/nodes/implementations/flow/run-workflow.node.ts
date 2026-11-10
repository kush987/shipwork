import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { NonRetryableError, RetryableError } from '../../../../shared/domain/errors';
import { renderTyped } from '../../../../shared/util/path';
import { isPlainObject, jsonSettingErrors, parseJsonObject, parseJsonValue } from '../../../../shared/util/json-setting';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { FAILED_OUTPUT } from '../../domain/workflow-node.constants';
import { toStepError } from '../../domain/step-errors';
import { toWorkflowRequest } from '../../domain/triggers';
import { WorkflowCalls } from '../../domain/workflow-caller';
import { CALL_TIMEOUT_SECONDS, CALLED_REQUEST, MAX_CALL_DEPTH, NO_RESPONSE_STATUS, REQUEST_MODES, RUN_MODES } from '../../domain/workflow-caller.constants';
import type { CalledBy, WorkflowCallResult } from '../../domain/workflow-caller';
import type { ConfigField, HttpRequestData, NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

const when = (key: string, value: string) => ({ key, values: [value] });

const CONFIG: ConfigField[] = [
  {
    key: 'workflowId',
    label: 'Workflow',
    kind: 'select',
    optionsSource: 'workflows',
    required: true,
    help: 'A published workflow that starts with an API request — the same kind an endpoint runs',
  },
  {
    key: 'mode',
    label: 'Mode',
    kind: 'select',
    options: [
      { value: 'wait', label: 'Wait for its answer' },
      { value: 'background', label: 'Start it and continue' },
    ],
    default: 'wait',
    help: 'Wait: what its Return response answers is saved for the next steps. Start: it runs on its own while this run goes on.',
  },
  {
    key: 'request',
    label: 'Request',
    kind: 'select',
    options: [
      { value: 'build', label: 'Build it here' },
      { value: 'forward', label: 'Pass this run’s request on' },
    ],
    default: 'build',
    help: 'What the workflow reads as request.*. Passing it on gives it the same body, params, query and headers.',
  },
  { key: 'body', label: 'Body', kind: 'json', default: '{}', visibleWhen: when('request', 'build'), help: `Read as request.body. ${TYPED_JSON_HELP}` },
  { key: 'params', label: 'Path params', kind: 'json', placeholder: '{"id": "{{context.order.id}}"}', visibleWhen: when('request', 'build'), help: 'Read as request.params' },
  { key: 'query', label: 'Query', kind: 'json', placeholder: '{"page": "1"}', visibleWhen: when('request', 'build'), help: 'Read as request.query' },
  {
    key: 'runAsCaller',
    label: 'Run as the caller',
    kind: 'boolean',
    default: true,
    help: 'It sees this run’s request.auth (user, roles, authorizer context), so its Authorize steps check the same caller. Off: it runs with no caller.',
  },
  {
    key: 'timeoutSeconds',
    label: 'Wait at most (seconds)',
    kind: 'number',
    default: CALL_TIMEOUT_SECONDS.default,
    visibleWhen: when('mode', 'wait'),
    help: `${CALL_TIMEOUT_SECONDS.min}–${CALL_TIMEOUT_SECONDS.max}. Longer and it's stopped, and this step takes its Failed path.`,
  },
  saveAsField('result', 'Next steps read context.<name>.status, .ok and .body'),
];

/** How deep the run calling this step already is (0 when an endpoint, event or schedule started it). */
const depthOf = (ctx: NodeExecutionContext) => Number((ctx.data.trigger.data as { calledBy?: Partial<CalledBy> } | null)?.calledBy?.depth ?? 0);

const asText = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));

/**
 * Runs another published workflow, as if its endpoint were called: with a request built here (or this
 * run's own), optionally as the same caller. Waits for its Return response and saves it — or starts it
 * in the background. Workflows stay small and reusable; an endpoint's workflow can combine several.
 */
@Injectable()
export class RunWorkflowNode implements WorkflowNode {
  constructor(private readonly calls: WorkflowCalls) {}

  readonly definition = {
    type: 'flow.run_workflow',
    category: 'flow' as const,
    label: 'Run workflow',
    description: 'Runs another workflow with a request you pass it and saves what it answers — or starts it in the background.',
    icon: 'workflow',
    configSchema: CONFIG,
    outputs: [{ id: 'ok', label: 'OK' }, { id: 'error', label: 'Error response' }, FAILED_OUTPUT],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = [
      ...saveAsErrors(config),
      ...jsonSettingErrors(config, [
        { key: 'body', label: 'Body', shape: 'any' },
        { key: 'params', label: 'Path params' },
        { key: 'query', label: 'Query' },
      ]),
    ];
    if (config.mode !== undefined && !(RUN_MODES as readonly unknown[]).includes(config.mode)) errors.push('Mode must be wait or background');
    if (config.request !== undefined && !(REQUEST_MODES as readonly unknown[]).includes(config.request)) errors.push('Request must be build or forward');
    const timeout = config.timeoutSeconds;
    if (timeout !== undefined && timeout !== null && timeout !== '') {
      const seconds = Number(timeout);
      if (!Number.isInteger(seconds) || seconds < CALL_TIMEOUT_SECONDS.min || seconds > CALL_TIMEOUT_SECONDS.max) {
        errors.push(`Wait at most must be ${CALL_TIMEOUT_SECONDS.min}–${CALL_TIMEOUT_SECONDS.max} seconds`);
      }
    }
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const depth = depthOf(ctx) + 1;
    if (depth > MAX_CALL_DEPTH) {
      throw new NonRetryableError(`Workflows are running each other ${MAX_CALL_DEPTH} levels deep — stopping here to prevent a loop`);
    }
    const wait = ctx.config.mode !== 'background';
    const call = {
      tenantId: ctx.tenantId,
      workflowId: String(ctx.config.workflowId ?? ''),
      request: this.requestFor(ctx),
      calledBy: { executionId: ctx.executionId, nodeId: ctx.nodeId, depth },
      shipmentId: ctx.data.shipment?.id ?? null,
      wait,
      timeoutMs: this.timeoutSeconds(ctx) * 1000,
      runId: wait ? undefined : `ex_${createHash('sha256').update(`call:${ctx.idempotencyKey}`).digest('hex').slice(0, 24)}`,
    };
    if (!call.workflowId) throw new NonRetryableError('Choose the workflow to run');
    let result: WorkflowCallResult;
    try {
      result = await this.calls.get().call(call);
    } catch (error) {
      // Running it again could repeat what it already did (records, messages), so no retry.
      const failure = toStepError(error);
      throw failure instanceof RetryableError ? new NonRetryableError(failure.message) : failure;
    }
    return this.outcome(ctx, result, depth);
  }

  private outcome(ctx: NodeExecutionContext, result: WorkflowCallResult, depth: number): NodeExecutionResult {
    const { workflow, executionId } = result;
    const who = `“${workflow.name}” (run ${executionId})`;
    if (result.kind === 'failed') throw new NonRetryableError(`${who} failed: ${result.error}`);
    if (result.kind === 'timeout') throw new NonRetryableError(`${who} didn't answer within ${result.timeoutMs / 1000} s`);
    const saveAs = saveAsKey(ctx.config, 'result');
    if (result.kind === 'started') {
      const saved = { started: true, executionId, workflow };
      return { outputHandle: 'ok', output: { ...saved, depth, savedAs: `context.${saveAs}` }, contextPatch: { [saveAs]: saved } };
    }
    const response = result.kind === 'response' ? result.response : { statusCode: NO_RESPONSE_STATUS, headers: {}, body: null };
    const saved = { status: response.statusCode, ok: response.statusCode < 400, body: response.body, headers: response.headers, executionId, workflow };
    return {
      outputHandle: saved.ok ? 'ok' : 'error',
      output: { ...saved, depth, savedAs: `context.${saveAs}`, ...(result.kind === 'finished' ? { note: 'It finished without a Return response' } : {}) },
      contextPatch: { [saveAs]: saved },
    };
  }

  /** What the called workflow reads as request.*: built from the settings, or this run's own request. */
  private requestFor(ctx: NodeExecutionContext): HttpRequestData {
    const own = ctx.data.request;
    const auth = ctx.config.runAsCaller === false ? null : (own?.auth ?? null);
    if (ctx.config.request === 'forward') {
      if (!own) throw new NonRetryableError('This run has no API request to pass on (an event or schedule started it) — build the request here instead');
      return { ...own, auth };
    }
    const body = renderTyped(parseJsonValue(ctx.config.body, 'Body') ?? {}, ctx.data);
    const params = renderTyped(parseJsonObject(ctx.config.params, 'Path params') ?? {}, ctx.data);
    const query = renderTyped(parseJsonObject(ctx.config.query, 'Query') ?? {}, ctx.data);
    return {
      ...toWorkflowRequest({ ...CALLED_REQUEST, params: asText(isPlainObject(params) ? params : {}), query: isPlainObject(query) ? query : {}, body }),
      auth,
    };
  }

  private timeoutSeconds(ctx: NodeExecutionContext): number {
    const seconds = Number(ctx.config.timeoutSeconds ?? CALL_TIMEOUT_SECONDS.default);
    if (!Number.isFinite(seconds)) return CALL_TIMEOUT_SECONDS.default;
    return Math.min(Math.max(Math.trunc(seconds), CALL_TIMEOUT_SECONDS.min), CALL_TIMEOUT_SECONDS.max);
  }
}
