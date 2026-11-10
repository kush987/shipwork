import type { GatewayResponse } from './gateway.types';

export type AuthorizerOutcome = { ok: true; context: Record<string, unknown> } | { ok: false; response: GatewayResponse };

/** What a run of the authorizer workflow decided (what the cache stores). */
export type AuthorizerDecision =
  | { allow: true; context: Record<string, unknown> }
  | { allow: false; status: number; error: string; message: string; body?: unknown; headers?: Record<string, string> };
