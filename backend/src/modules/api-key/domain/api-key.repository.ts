import { ApiKey } from './api-key.types';

export abstract class ApiKeyRepository {
  abstract create(key: ApiKey): Promise<void>;
  abstract list(tenantId: string): Promise<ApiKey[]>;
  abstract findByHash(hash: string): Promise<ApiKey | null>;
  abstract revoke(tenantId: string, id: string, at: string): Promise<boolean>;
  abstract touch(id: string, at: string): Promise<void>;
  /** Null when the key doesn't exist (or is revoked). */
  abstract setScope(tenantId: string, id: string, endpointIds: string[] | null): Promise<ApiKey | null>;
}
