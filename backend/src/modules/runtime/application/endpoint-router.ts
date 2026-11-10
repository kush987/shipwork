import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EndpointService } from '../../endpoint/application/endpoint.service';
import { matchPath, specificity } from '../../endpoint/domain/path-pattern';
import { ENDPOINTS_CHANGED } from '../../endpoint/application/endpoint.service.constants';
import type { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import { CACHE_TTL_MS, MAX_CACHED_TENANTS } from './endpoint-router.constants';
import { RouteResult } from './endpoint-router.types';
import type { DomainEvent } from '../../../shared/events/domain-events.types';
import { orderBy, uniq } from 'lodash';

/** Finds the endpoint for a call. The most specific path wins (`/orders/summary` before `/orders/:id`). */
@Injectable()
export class EndpointRouter {
  private readonly cache = new Map<string, { endpoints: ApiEndpoint[]; expiresAt: number }>();

  constructor(private readonly endpoints: EndpointService) {}

  async route(tenantId: string, method: string, path: string): Promise<RouteResult> {
    const matches = (await this.load(tenantId))
      .map((endpoint) => ({ endpoint, params: matchPath(endpoint.path, path) }))
      .filter((c): c is { endpoint: ApiEndpoint; params: Record<string, string> } => c.params !== null);
    const candidates = orderBy(matches, (c) => specificity(c.endpoint.path), 'desc');
    if (!candidates.length) return { kind: 'not_found' };
    const hit = candidates.find((c) => c.endpoint.method === method);
    if (!hit) return { kind: 'method_not_allowed', allowed: uniq(candidates.map((c) => c.endpoint.method)) };
    return { kind: 'matched', ...hit };
  }

  @OnEvent(ENDPOINTS_CHANGED)
  invalidate(event: Pick<DomainEvent, 'tenantId'>) {
    this.cache.delete(event.tenantId);
  }

  private async load(tenantId: string): Promise<ApiEndpoint[]> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.endpoints;
    const endpoints = await this.endpoints.listForRouting(tenantId);
    if (this.cache.size >= MAX_CACHED_TENANTS) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(tenantId, { endpoints, expiresAt: Date.now() + CACHE_TTL_MS });
    return endpoints;
  }
}
