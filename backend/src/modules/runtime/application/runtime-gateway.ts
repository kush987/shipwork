import { Inject, Injectable } from '@nestjs/common';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { toWorkflowRequest } from '../../nodes/domain/triggers';
import { validateRequestInput } from '../../endpoint/domain/api-endpoint';
import { EndpointRouter } from './endpoint-router';
import { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import { HTTP_TRIGGER_EVENT } from '../../nodes/domain/triggers.constants';
import { ENDPOINT_AUTHENTICATORS } from './endpoint-authenticators.constants';
import { EndpointAuthenticator } from './endpoint-authenticators.types';
import { ENDPOINT_INVOKERS } from './endpoint-invokers.constants';
import { EndpointInvoker } from './endpoint-invokers.types';
import { GatewayResponse, InboundRequest, LiveWorkflow, Principal } from './gateway.types';
import { gatewayError, endpointUnavailable, withHeaders } from './gateway.helpers';
import { WorkflowPausedError } from '../../workflow/domain/workflow.errors';
import { EndpointThrottle } from './endpoint-throttle';
import { EndpointAuthorizer } from './endpoint-authorizer';
import { pickStrategy } from '../../../shared/util/strategy';

/**
 * The data plane: turns an HTTP call into a workflow run. Each stage has one job and can stop the
 * pipeline with a precise error:
 *
 *   route (404/405) → authenticate (401/403) → rate limits (429) → check availability (503)
 *     → validate input (422) → authorizer workflow (403/503) → [sync: concurrent-call slot (429)] → invoke
 *
 * Authentication and invocation are strategies chosen by the endpoint's `auth` and `mode`. Every
 * response after the rate-limit stage carries `ratelimit-*` headers.
 */
@Injectable()
export class RuntimeGateway {
  constructor(
    private readonly router: EndpointRouter,
    private readonly workflows: WorkflowService,
    @Inject(ENDPOINT_AUTHENTICATORS) private readonly authenticators: EndpointAuthenticator[],
    @Inject(ENDPOINT_INVOKERS) private readonly invokers: EndpointInvoker[],
    private readonly throttle: EndpointThrottle,
    private readonly authorizer: EndpointAuthorizer,
  ) {}

  async handle(req: InboundRequest): Promise<GatewayResponse> {
    const method = req.method.toUpperCase();
    const route = await this.router.route(req.tenantId, method, req.path);
    if (route.kind === 'not_found') return gatewayError(404, 'not_found', `No endpoint matches ${req.path}`);
    if (route.kind === 'method_not_allowed') {
      const response = gatewayError(405, 'method_not_allowed', `${method} is not supported on ${req.path}`, { allowed: route.allowed });
      return { ...response, headers: { allow: route.allowed.join(', ') } };
    }
    const { endpoint, params } = route;

    const auth = await pickStrategy(this.authenticators, (a) => a.scheme === endpoint.auth, `auth '${endpoint.auth}'`).authenticate(req.tenantId, req.headers, endpoint);
    if (!auth.ok) {
      const refused = gatewayError(auth.status, auth.status === 403 ? 'forbidden' : 'unauthorized', auth.message);
      return endpoint.auth === 'jwt' && auth.status === 401 ? withHeaders(refused, { 'www-authenticate': 'Bearer' }) : refused;
    }

    // Before any database work, so refused calls stay cheap.
    const admission = await this.throttle.admit(req, endpoint, auth.principal);
    if (!admission.ok) return admission.response;
    return withHeaders(await this.run(req, method, endpoint, params, auth.principal), admission.headers);
  }

  private async run(req: InboundRequest, method: string, endpoint: ApiEndpoint, params: Record<string, string>, principal: Principal): Promise<GatewayResponse> {
    const workflow = await this.liveWorkflow(req.tenantId, endpoint);
    if ('status' in workflow) return workflow;

    const input = validateRequestInput(endpoint, { body: req.body ?? null, query: req.query });
    if (input.issues.length) {
      return gatewayError(422, 'invalid_request', 'The request does not match the endpoint’s schema', { issues: input.issues });
    }

    const verified = toWorkflowRequest({ method, path: req.path, params, query: input.query, headers: req.headers, body: input.body, auth: principal });
    const authorized = await this.authorizer.authorize(req.tenantId, endpoint, verified, req.requestId);
    if (!authorized.ok) return authorized.response;
    // What the authorizer learned (tenant, plan, permissions…) travels on as request.auth.context.
    const request = verified.auth ? { ...verified, auth: { ...verified.auth, context: authorized.context } } : verified;
    const invoker = pickStrategy(this.invokers, (i) => i.mode === endpoint.mode, `mode '${endpoint.mode}'`);
    const invocation = { endpoint, workflow, request, principal, requestId: req.requestId };
    if (endpoint.mode !== 'sync') return invoker.invoke(req.tenantId, invocation);

    // A sync call holds a runtime slot until it answers; cap how many one account holds at once.
    const slot = await this.throttle.syncSlot(req.tenantId, endpoint);
    if (!slot.ok) return slot.response;
    try {
      return await invoker.invoke(req.tenantId, invocation);
    } finally {
      await slot.release();
    }
  }

  /** The published version the call runs, or why the endpoint can't serve right now. */
  private async liveWorkflow(tenantId: string, endpoint: ApiEndpoint): Promise<LiveWorkflow | GatewayResponse> {
    if (!endpoint.enabled) return endpointUnavailable('This endpoint is disabled');
    const live = await this.workflows.resolvePublished(tenantId, endpoint.workflowId).catch((error: unknown) => (error instanceof WorkflowPausedError ? 'paused' : null));
    if (live === 'paused') return endpointUnavailable('The workflow behind this endpoint is paused');
    if (!live) return endpointUnavailable('The workflow behind this endpoint is not published');
    const props = live.workflow.toJSON();
    if (props.triggerEvent !== HTTP_TRIGGER_EVENT) return endpointUnavailable(`Workflow “${props.name}” does not start with an API request trigger`);
    return { id: props.id, name: props.name, version: live.version.version, definition: live.version.definition };
  }
}
