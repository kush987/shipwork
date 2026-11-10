import { GatewayResponse } from './gateway.types';

export const gatewayError = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): GatewayResponse => ({
  status,
  headers: {},
  body: { error, message, ...extra },
});

export const endpointUnavailable = (message: string) => gatewayError(503, 'endpoint_unavailable', message);

/** Adds headers (e.g. rate-limit state) without overriding ones the response already set. */
export const withHeaders = (response: GatewayResponse, headers: Record<string, string>): GatewayResponse => ({
  ...response,
  headers: { ...headers, ...response.headers },
});
