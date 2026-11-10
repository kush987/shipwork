import type { ApiEndpoint, ApiKey } from '../../api/types';

/** Endpoints a key can be limited to: the ones that use API-key auth. */
export const keyEndpoints = (endpoints: ApiEndpoint[] | undefined) => (endpoints ?? []).filter((e) => e.auth === 'api_key');

/** "GET /orders, POST /orders" for a key's scope (unknown ids — deleted endpoints — are skipped). */
export function scopeRoutes(key: Pick<ApiKey, 'endpointIds'>, endpoints: ApiEndpoint[] | undefined): string[] {
  const byId = new Map((endpoints ?? []).map((e) => [e.id, e]));
  return (key.endpointIds ?? []).flatMap((id) => (byId.has(id) ? [`${byId.get(id)!.method} ${byId.get(id)!.path}`] : []));
}

/** A scope can't be "only these" with nothing chosen: the key would call nothing. */
export const scopeProblem = (value: string[] | null) => (value !== null && value.length === 0 ? 'Choose at least one endpoint, or allow all' : undefined);
