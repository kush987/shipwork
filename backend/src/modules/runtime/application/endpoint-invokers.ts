import { Injectable } from '@nestjs/common';
import { ExecutionEngine } from '../../execution/application/execution-engine';
import { SyncExecutionRunner } from '../../execution/application/sync-execution.runner';
import { httpTrigger } from '../../nodes/domain/triggers';
import { StartExecutionInput } from '../../execution/application/execution-engine.types';
import { EndpointInvoker } from './endpoint-invokers.types';
import { GatewayResponse, Invocation } from './gateway.types';
import { gatewayError } from './gateway.helpers';

/** Both modes start the same kind of run; only how they wait for it differs. */
export function runInputFor(tenantId: string, { endpoint, workflow, request, principal, requestId }: Invocation): StartExecutionInput {
  return {
    tenantId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowVersion: workflow.version,
    definition: workflow.definition,
    trigger: httpTrigger(request, {
      endpoint: { id: endpoint.id, name: endpoint.name, method: endpoint.method, path: endpoint.path },
      caller: principal,
      requestId,
    }),
    shipmentId: null,
    mode: 'api',
  };
}

/** Waits for the workflow and answers with its response. */
@Injectable()
export class SyncInvoker implements EndpointInvoker {
  readonly mode = 'sync' as const;

  constructor(private readonly runner: SyncExecutionRunner) {}

  async invoke(tenantId: string, invocation: Invocation): Promise<GatewayResponse> {
    const result = await this.runner.run(runInputFor(tenantId, invocation), { timeoutMs: invocation.endpoint.timeoutMs });
    const { executionId } = result;
    switch (result.kind) {
      case 'response':
        return { status: result.response.statusCode, headers: result.response.headers, body: result.response.body, executionId };
      case 'completed':
        return result.status === 'succeeded'
          ? { status: 200, headers: {}, body: { ok: true, executionId }, executionId }
          : { ...gatewayError(500, 'workflow_failed', result.error ?? 'The workflow failed', { executionId }), executionId };
      case 'timeout':
        return { ...gatewayError(504, 'timeout', `The workflow did not answer within ${result.timeoutMs} ms`, { executionId }), executionId };
    }
  }
}

/** Queues the workflow and answers 202 at once; the caller can follow the run by its id. */
@Injectable()
export class AsyncInvoker implements EndpointInvoker {
  readonly mode = 'async' as const;

  constructor(private readonly engine: ExecutionEngine) {}

  async invoke(tenantId: string, invocation: Invocation): Promise<GatewayResponse> {
    const execution = await this.engine.start(runInputFor(tenantId, invocation));
    return { status: 202, headers: {}, body: { executionId: execution.id, status: 'queued' }, executionId: execution.id };
  }
}
