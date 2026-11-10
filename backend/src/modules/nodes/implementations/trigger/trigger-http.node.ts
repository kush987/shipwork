import { Injectable } from '@nestjs/common';
import { HTTP_TRIGGER_EVENT } from '../../domain/triggers.constants';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/**
 * Starts the workflow when an API endpoint bound to it is called. Method, path, auth and the
 * request schema live on the endpoint (Endpoints page), so one workflow can serve several endpoints.
 */
@Injectable()
export class TriggerHttpNode implements WorkflowNode {
  readonly definition = {
    type: 'trigger.http',
    category: 'trigger' as const,
    label: 'API request',
    description:
      'Starts when an endpoint bound to this workflow is called. Read the call as request.body, request.query, request.params and request.headers; answer with “Return response”.',
    icon: 'globe',
    isTrigger: true,
    triggerKind: 'http' as const,
    configSchema: [],
    outputs: DEFAULT_OUTPUT,
  };

  triggerKey(): string {
    return HTTP_TRIGGER_EVENT;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const request = ctx.data.request;
    return { outputHandle: 'default', output: request ? { method: request.method, path: request.path, params: request.params } : null };
  }
}
