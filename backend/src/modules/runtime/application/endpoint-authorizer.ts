import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/redis/redis.constants';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { SyncExecutionRunner } from '../../execution/application/sync-execution.runner';
import { httpTrigger } from '../../nodes/domain/triggers';
import { HTTP_TRIGGER_EVENT } from '../../nodes/domain/triggers.constants';
import { gatewayError } from './gateway.helpers';
import { decisionOf } from './endpoint-authorizer.helpers';
import { AUTHORIZER_CACHE_PREFIX, AUTHORIZER_TIMEOUT_MS } from './endpoint-authorizer.constants';
import type { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import type { HttpRequestData } from '../../nodes/domain/workflow-node.types';
import type { WorkflowDefinition } from '../../workflow/domain/workflow-definition.types';
import type { AuthorizerDecision, AuthorizerOutcome } from './endpoint-authorizer.types';
import { WorkflowPausedError } from '../../workflow/domain/workflow.errors';

/**
 * IAM as a workflow: before an endpoint's own workflow runs, its authorizer workflow gets the same
 * request (with `request.auth`) and must answer with an Access decision step. Allowed calls carry
 * the decision's context on as `request.auth.context`. Decisions may be cached per caller, method
 * and path (Redis, shared by replicas).
 */
@Injectable()
export class EndpointAuthorizer {
  constructor(
    private readonly workflows: WorkflowService,
    private readonly runner: SyncExecutionRunner,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async authorize(tenantId: string, endpoint: ApiEndpoint, request: HttpRequestData, requestId: string): Promise<AuthorizerOutcome> {
    if (!endpoint.authorizerWorkflowId) return { ok: true, context: {} };
    const live = await this.workflows.resolvePublished(tenantId, endpoint.authorizerWorkflowId).catch((error: unknown) => (error instanceof WorkflowPausedError ? 'paused' : null));
    if (live === 'paused') return { ok: false, response: gatewayError(503, 'authorizer_failed', 'The authorizer workflow is paused') };
    const props = live?.workflow.toJSON();
    if (!live || props?.triggerEvent !== HTTP_TRIGGER_EVENT) {
      return { ok: false, response: gatewayError(503, 'authorizer_failed', 'The authorizer workflow is not published with an API request trigger') };
    }

    const cacheKey = endpoint.authorizerCacheSeconds > 0 ? this.cacheKey(endpoint, live.version.version, request) : null;
    const decision = (cacheKey && (await this.cached(cacheKey))) || (await this.run(tenantId, endpoint, props, live.version, request, requestId));
    if (cacheKey && !(decision.allow === false && decision.status >= 500)) {
      await this.redis.set(cacheKey, JSON.stringify(decision), 'EX', endpoint.authorizerCacheSeconds).catch(() => undefined);
    }
    if (decision.allow) return { ok: true, context: decision.context };
    const response = gatewayError(decision.status, decision.error, decision.message);
    return { ok: false, response: decision.body !== undefined ? { ...response, body: decision.body, headers: decision.headers ?? {} } : response };
  }

  private async run(
    tenantId: string,
    endpoint: ApiEndpoint,
    workflow: { id: string; name: string },
    version: { version: number; definition: WorkflowDefinition },
    request: HttpRequestData,
    requestId: string,
  ): Promise<AuthorizerDecision> {
    const run = await this.runner.run(
      {
        tenantId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowVersion: version.version,
        definition: version.definition,
        trigger: httpTrigger(request, { endpoint: { id: endpoint.id, name: endpoint.name, method: endpoint.method, path: endpoint.path }, authorizer: true, requestId }),
        shipmentId: null,
        mode: 'api',
      },
      { timeoutMs: AUTHORIZER_TIMEOUT_MS },
    );
    return decisionOf(run, AUTHORIZER_TIMEOUT_MS);
  }

  /** Same caller (type + id), same method and path, same authorizer version → same decision. */
  private cacheKey(endpoint: ApiEndpoint, version: number, request: HttpRequestData) {
    const who = request.auth ? `${request.auth.type}:${request.auth.provider ?? ''}:${request.auth.id}` : 'anonymous';
    const digest = createHash('sha256').update(JSON.stringify([who, request.method, request.path])).digest('hex');
    return `${AUTHORIZER_CACHE_PREFIX}${endpoint.id}:${version}:${digest}`;
  }

  private async cached(key: string): Promise<AuthorizerDecision | null> {
    const raw = await this.redis.get(key).catch(() => null);
    return raw ? (JSON.parse(raw) as AuthorizerDecision) : null;
  }
}
