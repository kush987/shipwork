import type { ApiEndpoint, HttpMethod } from '../../endpoint/domain/api-endpoint.types';

export type RouteResult =
  | { kind: 'matched'; endpoint: ApiEndpoint; params: Record<string, string> }
  | { kind: 'method_not_allowed'; allowed: HttpMethod[] }
  | { kind: 'not_found' };
