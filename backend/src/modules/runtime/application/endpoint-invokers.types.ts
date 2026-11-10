import type { EndpointMode } from '../../endpoint/domain/api-endpoint.types';
import { Invocation, GatewayResponse } from './gateway.types';

/** One strategy per endpoint mode (Strategy pattern): how a call turns into a run and a reply. */
export interface EndpointInvoker {
  readonly mode: EndpointMode;
  invoke(tenantId: string, invocation: Invocation): Promise<GatewayResponse>;
}
