import { HTTP_METHODS, ENDPOINT_AUTH, ENDPOINT_MODES } from './api-endpoint.constants';
import { FieldSpec } from '../../../shared/schema/field-schema.types';

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type EndpointMode = (typeof ENDPOINT_MODES)[number];

export type EndpointAuth = (typeof ENDPOINT_AUTH)[number];

/**
 * An API endpoint: the public contract (method, path, auth, input schema) of a workflow. Kept apart
 * from the workflow so routing/auth concerns don't leak into business logic, and one workflow can
 * back several endpoints.
 */
export interface ApiEndpoint {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  method: HttpMethod;
  path: string;
  workflowId: string;
  mode: EndpointMode;
  auth: EndpointAuth;
  requestSchema: FieldSpec[];
  timeoutMs: number;
  /**
   * Calls per minute one caller (API key, or client IP for public endpoints) may make to this
   * endpoint; null = only the account-wide limits apply. For expensive endpoints.
   */
  rateLimitPerMinute: number | null;
  /** auth = 'jwt': the sign-in provider whose tokens callers send. */
  authProviderId: string | null;
  /**
   * A published workflow (API request trigger) that decides, before this endpoint's own workflow
   * runs, whether the call may proceed — custom IAM built as a workflow.
   */
  authorizerWorkflowId: string | null;
  /** Reuse an authorizer decision for the same caller, method and path for this long (0 = never). */
  authorizerCacheSeconds: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EndpointInput = Pick<ApiEndpoint, 'name' | 'method' | 'path'> &
  Partial<
    Pick<
      ApiEndpoint,
      | 'description'
      | 'workflowId'
      | 'mode'
      | 'auth'
      | 'requestSchema'
      | 'timeoutMs'
      | 'rateLimitPerMinute'
      | 'authProviderId'
      | 'authorizerWorkflowId'
      | 'authorizerCacheSeconds'
      | 'enabled'
    >
  >;
