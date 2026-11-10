import { ApiEndpoint } from './api-endpoint.types';

export abstract class EndpointRepository {
  abstract save(endpoint: ApiEndpoint): Promise<void>;
  abstract findById(tenantId: string, id: string): Promise<ApiEndpoint | null>;
  abstract list(tenantId: string): Promise<ApiEndpoint[]>;
  abstract delete(tenantId: string, id: string): Promise<boolean>;
  abstract count(tenantId: string): Promise<number>;
}
