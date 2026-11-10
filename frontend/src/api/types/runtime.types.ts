// Calls to the runtime gateway (data plane).
import type { HttpMethod } from './common.types';

export interface RuntimeCall {
  method: HttpMethod;
  /** Resolved path, e.g. '/orders/42' (no `:params` left). */
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  apiKey?: string;
  /** Sent as `Authorization: Bearer …` (JWT endpoints). */
  bearer?: string;
}

/** What the runtime gateway answered to a direct call (never throws on a non-2xx status). */
export interface RuntimeResponse {
  status: number;
  statusText: string;
  ok: boolean;
  durationMs: number;
  headers: Record<string, string>;
  executionId: string | null;
  requestId: string | null;
  body: unknown;
}
