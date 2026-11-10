import type { HttpRequestData, RequestAuth } from '../../nodes/domain/workflow-node.types';
import type { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import type { WorkflowDefinition } from '../../workflow/domain/workflow-definition.types';

/** An inbound call as the gateway sees it: transport details already stripped by the controller. */
export interface InboundRequest {
  tenantId: string;
  method: string;
  /** Path below the tenant's base URL, e.g. `/orders/42`. */
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  requestId: string;
  /** The caller's address (behind a proxy only with TRUST_PROXY=true), for per-IP limits. */
  clientIp: string;
}

/** What to send back. `executionId` becomes the `x-execution-id` header. */
export interface GatewayResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  executionId?: string;
}

/** Who called, once authenticated (null for public endpoints) — exactly what workflows get as `request.auth`. */
export type Principal = RequestAuth | null;

/** The live workflow version an endpoint call runs. */
export interface LiveWorkflow {
  id: string;
  name: string;
  version: number;
  definition: WorkflowDefinition;
}

export interface Invocation {
  endpoint: ApiEndpoint;
  workflow: LiveWorkflow;
  request: HttpRequestData;
  principal: Principal;
  requestId: string;
}
