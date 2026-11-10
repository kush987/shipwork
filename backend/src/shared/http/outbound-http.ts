import { Injectable } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { config } from '../../config/configuration';
import { OutboundFailure, OutboundRequest, OutboundResponse, Range } from './outbound-http.types';
import { MAX_REDIRECTS, MAX_BODY_BYTES } from './outbound-http.constants';

export class OutboundHttpError extends Error {
  constructor(
    readonly kind: OutboundFailure,
    message: string,
  ) {
    super(message);
    this.name = 'OutboundHttpError';
  }
  /** Network blips and timeouts may succeed later; bad/blocked URLs and huge bodies won't. */
  get retryable() {
    return this.kind === 'timeout' || this.kind === 'network';
  }
}

/**
 * The one way workflow steps call external APIs. Guards against SSRF: only http(s), and
 * every hop (including redirects) must resolve to a public address. Loopback/private ranges
 * can be allowed for local development; link-local (cloud metadata, 169.254.x) never is.
 */
@Injectable()
export class OutboundHttp {
  async request(req: OutboundRequest): Promise<OutboundResponse> {
    const started = Date.now();
    let url = this.buildUrl(req.url, req.query);
    const method = req.method.toUpperCase();
    const hasBody = req.body !== undefined && method !== 'GET' && method !== 'HEAD';
    const headers: Record<string, string> = { accept: 'application/json, text/plain;q=0.9, */*;q=0.5', ...(req.headers ?? {}) };
    if (hasBody && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';

    for (let hop = 0; ; hop++) {
      await this.assertPublic(url);
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: hasBody ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : undefined,
          redirect: 'manual',
          signal: AbortSignal.timeout(req.timeoutMs ?? 10_000),
        });
      } catch (error) {
        const e = error as Error;
        if (e.name === 'TimeoutError' || e.name === 'AbortError') {
          throw new OutboundHttpError('timeout', `${method} ${url.host} timed out after ${req.timeoutMs ?? 10_000} ms`);
        }
        throw new OutboundHttpError('network', `${method} ${url.host} failed: ${(e as { cause?: Error }).cause?.message ?? e.message}`);
      }

      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) throw new OutboundHttpError('network', `Too many redirects from ${req.url}`);
        url = new URL(location, url);
        continue;
      }

      const text = await this.readCapped(res);
      let body: unknown = text;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          /* not JSON: keep text */
        }
      }
      return {
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
        body,
        durationMs: Date.now() - started,
        url: url.toString(),
      };
    }
  }

  private buildUrl(raw: string, query?: Record<string, unknown>): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new OutboundHttpError('invalid_url', `"${raw}" is not a valid URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new OutboundHttpError('invalid_url', `Only http and https URLs are allowed (got ${url.protocol})`);
    }
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return url;
  }

  private async assertPublic(url: URL) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addresses: string[];
    try {
      addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new OutboundHttpError('network', `Could not resolve ${host}`);
    }
    for (const address of addresses) {
      const range = classify(address);
      if (range === 'link-local' || range === 'unspecified') {
        throw new OutboundHttpError('blocked', `${host} resolves to ${address} (${range}), which workflows may not call`);
      }
      if ((range === 'loopback' || range === 'private') && !config.httpAllowPrivateNetworks) {
        throw new OutboundHttpError(
          'blocked',
          `${host} resolves to a ${range} address (${address}). Set HTTP_ALLOW_PRIVATE_NETWORKS=true to allow this in development.`,
        );
      }
    }
  }

  private async readCapped(res: Response): Promise<string> {
    if (!res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new OutboundHttpError('too_large', `Response is larger than ${MAX_BODY_BYTES / 1024} KB`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}

export function classify(address: string): Range {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 127) return 'loopback';
    if (a === 0) return 'unspecified';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
    return 'public';
  }
  const v6 = address.toLowerCase();
  if (v6 === '::1') return 'loopback';
  if (v6 === '::') return 'unspecified';
  if (v6.startsWith('::ffff:')) return classify(v6.slice(7));
  if (/^fe[89ab]/.test(v6)) return 'link-local';
  if (/^f[cd]/.test(v6)) return 'private';
  return 'public';
}
