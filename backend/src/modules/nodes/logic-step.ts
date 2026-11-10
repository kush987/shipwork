import { isPlainObject } from 'lodash';
import { NonRetryableError } from '../../shared/domain/errors';
import { renderTyped } from '../../shared/util/path';
import { SandboxError } from '../custom-node/application/code-sandbox';
import { CodeSandbox } from '../custom-node/application/code-sandbox.ports';
import { isValidStatusCode, responseHeaderIssues, toWorkflowResponse } from './domain/workflow-response';
import { failMessage, protectLiterals, savedKeyOf } from './domain/step-logic';
import { LITERALS_KEY, STEP_LOGIC_HOOKS, wrapStepLogic } from './domain/step-logic.constants';
import type { ExecutionData, NodeExecutionContext, NodeExecutionResult, WorkflowNode } from './domain/workflow-node.types';
import type { HookCall, HookEnvelope, LogicTrace } from './logic-step.types';
import type { StepLogic } from '../workflow/domain/workflow-definition.types';

type Hook = (typeof STEP_LOGIC_HOOKS)[number];

const quoted = (keys: string[]) => keys.map((k) => `“${k}”`).join(', ');

/**
 * Whose logic this is: a step's own (saved on the step), or the workspace's for every step of the type
 * (saved on the Nodes page). Each records its trace under its own key and names itself in errors.
 */
export interface LogicScope {
  traceKey: string;
  label: string;
}

export const STEP_SCOPE: LogicScope = { traceKey: 'logic', label: '' };
export const WORKSPACE_SCOPE: LogicScope = { traceKey: 'workspaceLogic', label: 'Workspace ' };

/**
 * A built-in step with the workspace's own logic around it (Decorator): before() can replace some
 * of its settings or answer the API call instead, after() can replace what it saves, pick another
 * path or answer. The step itself is unchanged, so every built-in step gets this for free.
 */
export class LogicStep implements WorkflowNode {
  constructor(
    private readonly inner: WorkflowNode,
    private readonly logic: StepLogic,
    private readonly sandbox: CodeSandbox,
    private readonly scope: LogicScope = STEP_SCOPE,
  ) {}

  get definition() {
    return this.inner.definition;
  }

  validateConfig(config: Record<string, unknown>) {
    return this.inner.validateConfig?.(config) ?? [];
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const trace: LogicTrace = {};
    let config = ctx.config;
    let data = ctx.data;

    if (this.logic.before?.trim()) {
      const call = await this.call('before', ctx, { settings: renderTyped(config, data) });
      trace.before = { logs: call.logs };
      if (call.respond) return this.answered(call.respond, trace, 'before');
      if (call.branch) throw new NonRetryableError(`${this.scope.label}before(): branch() works in after() — before() returns settings, or calls respond()`);
      if (!call.keep && call.value !== null) {
        ({ config, data } = this.withSettings(call.value, config, data));
        trace.before.changed = Object.keys(call.value as object);
      }
    }

    let result = await this.inner.execute({ ...ctx, config, data });

    if (this.logic.after?.trim()) {
      const savedKey = savedKeyOf(this.definition, config);
      const saved = savedKey ? (result.contextPatch?.[savedKey] ?? null) : (result.contextPatch ?? {});
      const call = await this.call('after', ctx, { result: saved, path: result.outputHandle, settings: renderTyped(config, data) });
      trace.after = { logs: call.logs };
      if (call.respond) return { ...this.answered(call.respond, trace, 'after'), contextPatch: result.contextPatch };
      result = this.reshaped(result, call, savedKey, trace);
    }

    const key = this.scope.traceKey;
    return { ...result, output: isPlainObject(result.output) ? { ...(result.output as object), [key]: trace } : { value: result.output, [key]: trace } };
  }

  /** Runs one hook in the sandbox; its logs also go to the step's log. */
  private async call(hook: Hook, ctx: NodeExecutionContext, extra: Record<string, unknown>): Promise<HookCall> {
    const { request, context, trigger, shipment } = ctx.data;
    try {
      const { value, logs } = await this.sandbox.run(wrapStepLogic(this.logic[hook]!, hook), { ...extra, request, context, trigger, shipment });
      logs.forEach((line) => ctx.logger.log(`[${hook}] ${line}`));
      return { ...(value as HookEnvelope), logs };
    } catch (error) {
      // A bug in the code won't fix itself on retry; fail('…') reads as its own message.
      if (error instanceof SandboxError) throw new NonRetryableError(`${this.scope.label}${hook}(): ${failMessage(error.message)}`);
      throw error;
    }
  }

  /** Settings from before(), as values: text with `{{` can't be rendered as a placeholder again. */
  private withSettings(value: unknown, config: Record<string, unknown>, data: ExecutionData) {
    if (!isPlainObject(value)) throw new NonRetryableError(`${this.scope.label}before() must return an object of settings, e.g. { record: { … } } — or nothing`);
    const known = this.definition.configSchema.map((f) => f.key);
    const unknown = Object.keys(value as object).filter((k) => !known.includes(k));
    if (unknown.length) {
      throw new NonRetryableError(`${this.scope.label}before() returned ${quoted(unknown)}, which ${unknown.length === 1 ? "isn't a setting" : "aren't settings"} of “${this.definition.label}” (settings: ${known.join(', ')})`);
    }
    // Continue any literals an outer (workspace) before() already protected, so neither overwrites the other's.
    const earlier = (data as unknown as Record<string, unknown>)[LITERALS_KEY];
    const literals: string[] = Array.isArray(earlier) ? [...(earlier as string[])] : [];
    const before = literals.length;
    const protectedValue = protectLiterals(value, literals) as Record<string, unknown>;
    return { config: { ...config, ...protectedValue }, data: literals.length > before ? ({ ...data, [LITERALS_KEY]: literals } as ExecutionData) : data };
  }

  /** after()'s value replaces what the step saves; branch() picks the path. */
  private reshaped(result: NodeExecutionResult, call: HookCall, savedKey: string | null, trace: LogicTrace): NodeExecutionResult {
    const paths = this.definition.outputs.map((o) => o.id);
    if (call.branch && !paths.includes(call.branch)) {
      throw new NonRetryableError(`${this.scope.label}after() chose branch('${call.branch}'), but “${this.definition.label}” has the paths ${paths.map((p) => `'${p}'`).join(', ')}`);
    }
    let contextPatch = result.contextPatch;
    if (!call.keep) {
      if (savedKey) contextPatch = { ...(contextPatch ?? {}), [savedKey]: call.value };
      else if (isPlainObject(call.value)) contextPatch = call.value as Record<string, unknown>;
      else throw new NonRetryableError(`${this.scope.label}after() must return an object of values to save — this step has no “Save result as”`);
      trace.after!.changed = true;
    }
    if (call.branch) trace.after!.branch = call.branch;
    return { ...result, outputHandle: call.branch ?? result.outputHandle, contextPatch };
  }

  /** respond(): the API caller gets this, and the path stops here. */
  private answered(respond: NonNullable<HookCall['respond']>, trace: LogicTrace, hook: Hook): NodeExecutionResult {
    const status = Number(respond.status);
    if (!isValidStatusCode(status)) throw new NonRetryableError(`${this.scope.label}${hook}(): respond() needs a status code from 200 to 599, got ${JSON.stringify(respond.status)}`);
    const headers = isPlainObject(respond.headers) ? (respond.headers as Record<string, unknown>) : {};
    const headerIssue = responseHeaderIssues(headers)[0];
    if (headerIssue) throw new NonRetryableError(`${this.scope.label}${hook}(): ${headerIssue}`);
    const response = toWorkflowResponse(status, headers, respond.body);
    trace[hook]!.responded = status;
    return { outputHandle: this.definition.outputs[0].id, output: { [this.scope.traceKey]: trace, response }, response, stop: true };
  }
}
