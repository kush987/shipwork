import { Injectable } from '@nestjs/common';
import type { HttpRequestData, WorkflowResponse } from './workflow-node.types';

/** The run (and step) that called a workflow; the called run reads it as `trigger.data.calledBy`. */
export interface CalledBy {
  executionId: string;
  nodeId: string;
  /** 1 for a workflow run by an API- or event-started one, 2 for one it runs, and so on. */
  depth: number;
  workflowId?: string | null;
  workflowName?: string | null;
}

export interface WorkflowCallRequest {
  tenantId: string;
  workflowId: string;
  /** What the called workflow reads as `request.*`. */
  request: HttpRequestData;
  calledBy: CalledBy;
  /** The caller's shipment, so the called workflow can read `{{shipment.*}}` too. */
  shipmentId: string | null;
  /** Wait for its answer (up to `timeoutMs`), or start it in the background. */
  wait: boolean;
  timeoutMs: number;
  /** Makes a background start idempotent: a redelivered step starts the run once. */
  runId?: string;
}

export interface CalledWorkflow {
  id: string;
  name: string;
  version: number;
}

/** How a called workflow ended, as far as its caller is concerned. */
export type WorkflowCallResult =
  | { kind: 'response'; executionId: string; workflow: CalledWorkflow; response: WorkflowResponse }
  | { kind: 'finished'; executionId: string; workflow: CalledWorkflow }
  | { kind: 'failed'; executionId: string; workflow: CalledWorkflow; error: string }
  | { kind: 'timeout'; executionId: string; workflow: CalledWorkflow; timeoutMs: number }
  | { kind: 'started'; executionId: string; workflow: CalledWorkflow };

/**
 * Runs another published workflow (port). Implemented where the engine lives; the Run workflow step
 * depends only on this, so steps don't depend on the engine that runs them (DIP, no module cycle).
 */
export abstract class WorkflowCaller {
  abstract call(request: WorkflowCallRequest): Promise<WorkflowCallResult>;
}

/**
 * Where the step finds the caller. The execution module binds its implementation at startup; the
 * step module can't import that module, because the engine itself depends on the steps.
 */
@Injectable()
export class WorkflowCalls {
  private caller: WorkflowCaller | null = null;

  bind(caller: WorkflowCaller) {
    this.caller = caller;
  }

  get(): WorkflowCaller {
    if (!this.caller) throw new Error('Running other workflows is not available in this process');
    return this.caller;
  }
}
