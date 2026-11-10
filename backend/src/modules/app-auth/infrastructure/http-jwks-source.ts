import { Injectable } from '@nestjs/common';
import type { JSONWebKeySet } from 'jose';
import { OutboundHttp } from '../../../shared/http/outbound-http';
import { JwksSource } from '../application/app-auth.ports';
import { TokenError } from '../application/token.service.errors';
import { JWKS_CACHE_MS, JWKS_MIN_REFRESH_MS, JWKS_TIMEOUT_MS } from './http-jwks-source.constants';
import type { AuthProvider } from '../domain/app-auth.types';

/**
 * Reads an identity provider's JWKS through ShipFlow's guarded HTTP client (public addresses only,
 * size and time limits), caches it, and refreshes at most every JWKS_MIN_REFRESH_MS on unknown keys.
 */
@Injectable()
export class HttpJwksSource extends JwksSource {
  private readonly cache = new Map<string, { at: number; url: string; keys: Promise<JSONWebKeySet> }>();

  constructor(private readonly http: OutboundHttp) {
    super();
  }

  keys(provider: AuthProvider, refresh = false): Promise<JSONWebKeySet> {
    const cached = this.cache.get(provider.id);
    const age = cached ? Date.now() - cached.at : Infinity;
    if (cached && cached.url === provider.jwksUrl && (refresh ? age < JWKS_MIN_REFRESH_MS : age < JWKS_CACHE_MS)) return cached.keys;
    const keys = this.fetch(provider.jwksUrl!);
    keys.catch(() => this.cache.delete(provider.id));
    this.cache.set(provider.id, { at: Date.now(), url: provider.jwksUrl!, keys });
    return keys;
  }

  private async fetch(url: string): Promise<JSONWebKeySet> {
    const res = await this.http.request({ method: 'GET', url, timeoutMs: JWKS_TIMEOUT_MS }).catch((error) => {
      throw new TokenError(`Could not read the identity provider's keys: ${(error as Error).message}`);
    });
    const body = res.body as Partial<JSONWebKeySet> | null;
    if (!res.ok || !Array.isArray(body?.keys)) throw new TokenError(`The JWKS URL answered ${res.status} without a key set`);
    return body as JSONWebKeySet;
  }
}
