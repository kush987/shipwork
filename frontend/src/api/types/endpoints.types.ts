// API endpoints — Backend as a Service (docs/API_CONTRACT.md).
import type { FieldSpec, HttpMethod } from './common.types';
import type { WorkflowStatus } from './workflows.types';

export type RequestField = FieldSpec;

export type EndpointAuth = 'none' | 'api_key' | 'jwt';

export interface ApiEndpoint {
  id: string;
  name: string;
  description: string;
  method: HttpMethod;
  /** '/orders' or '/orders/:id' */
  path: string;
  workflowId: string;
  /** sync: wait for the workflow and return its response; async: 202 + executionId */
  mode: 'sync' | 'async';
  /** none: public · api_key: a key from API keys · jwt: a token from a sign-in provider */
  auth: EndpointAuth;
  /** The sign-in provider that verifies tokens (auth = 'jwt'). */
  authProviderId: string | null;
  /** Published API workflow that allows or denies every call before this endpoint's workflow runs. */
  authorizerWorkflowId: string | null;
  /** 0–300; > 0 reuses a decision for the same caller + method + path. */
  authorizerCacheSeconds: number;
  /** Validates the JSON body (POST/PUT/PATCH) or the query string (GET/DELETE). */
  requestSchema: RequestField[];
  /** sync only, 1000–30000 */
  timeoutMs: number;
  /** Calls per minute per caller (API key, or IP for public endpoints); null = account-wide limits only */
  rateLimitPerMinute: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** '/api/run/<tenant><path>', relative to the API origin */
  url: string;
  workflow: {
    id: string;
    name: string;
    status: WorkflowStatus;
    publishedVersion: number | null;
    triggerEvent: string | null;
    paused: boolean;
  } | null;
  /** enabled, and the workflow is published with an API request trigger */
  ready: boolean;
  /** why it isn't ready, in plain words */
  issues: string[];
}

export type EndpointInput = Pick<ApiEndpoint, 'name' | 'method' | 'path'> &
  Partial<
    Pick<
      ApiEndpoint,
      | 'description'
      | 'workflowId'
      | 'mode'
      | 'auth'
      | 'authProviderId'
      | 'authorizerWorkflowId'
      | 'authorizerCacheSeconds'
      | 'requestSchema'
      | 'timeoutMs'
      | 'rateLimitPerMinute'
      | 'enabled'
    >
  >;

/** Body of PUT /endpoints/:id — `workflowId` is required on update. */
export type EndpointUpdateInput = EndpointInput & { workflowId: string };
