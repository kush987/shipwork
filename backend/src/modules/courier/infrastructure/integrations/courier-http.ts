import { OutboundHttp, OutboundHttpError } from '../../../../shared/http/outbound-http';
import { CourierRejectedError, CourierUnavailableError } from '../../domain/courier-provider';
import { REAL_CALL_TIMEOUT_MS } from '../../domain/courier-integration.constants';
import type { CourierRequest } from './courier-http.types';

/** The courier refused the settings themselves (wrong key, expired account): fix them on the Couriers page. */
export class CourierAuthError extends CourierRejectedError {}

/** The most useful message in a courier's error body, whatever its shape. */
export function messageOf(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 300);
  if (!body || typeof body !== 'object') return '';
  const b = body as Record<string, unknown>;
  for (const key of ['message', 'error', 'rmk', 'remark', 'remarks', 'ErrorMessage', 'error_message', 'detail', 'msg']) {
    const v = b[key];
    if (typeof v === 'string' && v.trim()) return v.slice(0, 300);
    if (Array.isArray(v) && v.length) return v.map(String).join('; ').slice(0, 300);
    if (v && typeof v === 'object') return messageOf(v);
  }
  return JSON.stringify(body).slice(0, 300);
}

/**
 * One courier's HTTP calls. Turns every failure into the two errors the gateway understands:
 * CourierUnavailableError (network, timeout, 5xx, 429 — retried, counts towards the circuit breaker)
 * and CourierRejectedError (4xx — the courier said no; retrying won't help).
 */
export class CourierHttp {
  constructor(
    private readonly http: OutboundHttp,
    readonly code: string,
    private readonly name: string,
    private readonly baseUrl: string,
  ) {}

  async send<T = unknown>(req: CourierRequest): Promise<T> {
    const url = /^https?:\/\//.test(req.path) ? req.path : `${this.baseUrl}${req.path.startsWith('/') ? '' : '/'}${req.path}`;
    let res;
    try {
      res = await this.http.request({ method: req.method, url, headers: req.headers, query: req.query, body: req.body, timeoutMs: REAL_CALL_TIMEOUT_MS });
    } catch (error) {
      if (error instanceof OutboundHttpError && error.retryable) throw new CourierUnavailableError(this.code, `${this.name}: ${error.message}`);
      throw new CourierRejectedError(this.code, `${this.name}: ${(error as Error).message}`);
    }
    const detail = messageOf(res.body);
    if (res.status === 401 || res.status === 403) {
      throw new CourierAuthError(this.code, `${this.name} refused the credentials (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
    }
    if (res.status >= 500 || res.status === 429) throw new CourierUnavailableError(this.code, `${this.name} answered HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    if (res.status >= 400) throw new CourierRejectedError(this.code, `${this.name} refused the request (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
    return res.body as T;
  }
}

/**
 * A sign-in token kept until shortly before it expires. `withToken` retries once with a fresh token
 * when the courier says the cached one is no longer valid.
 */
export class TokenCache {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly fetchToken: () => Promise<{ token: string; ttlSeconds: number }>) {}

  async get(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const { token, ttlSeconds } = await this.fetchToken();
    // Renew a minute early, so a token never expires mid-call.
    this.token = { value: token, expiresAt: Date.now() + Math.max(30, ttlSeconds - 60) * 1000 };
    return token;
  }

  async withToken<T>(call: (token: string) => Promise<T>): Promise<T> {
    try {
      return await call(await this.get());
    } catch (error) {
      if (!(error instanceof CourierAuthError) || !this.token) throw error;
      this.token = null;
      return call(await this.get());
    }
  }
}
