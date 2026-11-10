export interface OutboundRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  timeoutMs?: number;
}

export interface OutboundResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
  /** Final URL after redirects. */
  url: string;
}

export type OutboundFailure = 'invalid_url' | 'blocked' | 'timeout' | 'network' | 'too_large';

export type Range = 'public' | 'loopback' | 'private' | 'link-local' | 'unspecified';
