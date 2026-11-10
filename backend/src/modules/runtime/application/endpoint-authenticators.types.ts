import type { ApiEndpoint, EndpointAuth } from '../../endpoint/domain/api-endpoint.types';
import type { InboundRequest, Principal } from './gateway.types';

/** 401: no valid credentials · 403: valid credentials that may not call this endpoint. */
export type AuthOutcome = { ok: true; principal: Principal } | { ok: false; status: 401 | 403; message: string };

/**
 * One strategy per endpoint auth scheme. A new scheme (JWT, OAuth…) is a new class registered in
 * RuntimeModule; the gateway doesn't change.
 */
export interface EndpointAuthenticator {
  readonly scheme: EndpointAuth;
  authenticate(tenantId: string, headers: InboundRequest['headers'], endpoint: ApiEndpoint): Promise<AuthOutcome>;
}
