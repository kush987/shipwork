import { NonRetryableError } from '../../../../shared/domain/errors';
import { renderDeep } from '../../../../shared/util/path';
import { asStep } from '../../domain/step-errors';
import { saveAsErrors, saveAsKey } from '../../domain/node-config';
import { runCustomNode } from '../../../custom-node/application/custom-node-runner';
import type { EventDefinitionService } from '../../../custom-event/application/event-definition.service';
import { CodeSandbox } from '../../../custom-node/application/code-sandbox.ports';
import { isSimpleFormat, resultNameOf } from '../../../custom-node/domain/custom-node';
import type { CustomNodeEmit, CustomNodeVersion } from '../../../custom-node/domain/custom-node.types';
import { NodeExecutionContext, NodeExecutionResult, NodeTypeDefinition, WorkflowNode } from '../../domain/workflow-node.types';
import { customNodeDefinition } from './custom-node-definition';

/**
 * Adapts one immutable version of a user-defined node to the WorkflowNode contract, so the engine
 * runs it exactly like a built-in node. The user's code only computes; its only effects are what
 * it hands back (branch, result, events to send).
 */
export class CustomWorkflowNode implements WorkflowNode {
  readonly definition: NodeTypeDefinition;
  private readonly simple: boolean;

  constructor(
    private readonly version: CustomNodeVersion,
    private readonly sandbox: CodeSandbox,
    private readonly events: EventDefinitionService,
  ) {
    this.definition = customNodeDefinition(version, { id: version.customNodeId, version: version.version });
    this.simple = isSimpleFormat(version);
  }

  validateConfig(config: Record<string, unknown>): string[] {
    return this.simple ? saveAsErrors(config) : [];
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const { shipment, context, trigger, request } = ctx.data;
    const run = await runCustomNode(this.sandbox, this.version, {
      config: renderDeep(ctx.config, ctx.data),
      shipment,
      context,
      request,
      trigger: { event: trigger.event },
    });
    run.logs.forEach((line) => ctx.logger.log(`[custom] ${line}`));
    // A bug in user code won't fix itself on retry; a wired "Failed" branch still catches it.
    if (!run.ok) throw new NonRetryableError(`${this.version.label} v${this.version.version}: ${run.error}`);
    run.warnings.forEach((warning) => ctx.logger.warn(`[custom] ${warning}`));

    const emitted = await this.emit(ctx, run.result.emit);
    const { outputHandle, output } = run.result;
    const trace = {
      logs: run.logs,
      version: this.version.version,
      ...(emitted.length ? { emitted } : {}),
      ...(run.warnings.length ? { warnings: run.warnings } : {}),
    };
    if (!this.simple) return { outputHandle, output: { result: output, ...trace }, contextPatch: run.result.context };

    const savedAs = saveAsKey(ctx.config, resultNameOf(this.version));
    return { outputHandle, output: { result: output, savedAs, ...trace }, contextPatch: { [savedAs]: output } };
  }

  /** Sends the custom events run() asked for, for the run's shipment. */
  private async emit(ctx: NodeExecutionContext, events: CustomNodeEmit[]): Promise<string[]> {
    if (!events.length) return [];
    const { shipment, trigger } = ctx.data;
    if (!shipment) throw new NonRetryableError(`${this.version.label}: events can only be emitted for a shipment`);
    const depth = Number((trigger.data as { chainDepth?: number } | null)?.chainDepth ?? 0) + 1;
    const emitted: string[] = [];
    for (const e of events) {
      // Unknown/archived event, bad payload or loop guard: retrying won't help.
      await asStep(
        () => this.events.emit(ctx.tenantId, { event: e.event, shipmentId: shipment.id, payload: e.payload }, `workflow:${ctx.executionId}`, depth),
        `${this.version.label}: could not emit ${e.event}`,
      );
      emitted.push(e.event);
    }
    return emitted;
  }
}
