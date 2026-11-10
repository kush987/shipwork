import { ApiKey } from '../modules/api-key/domain/api-key.types';
import { ApiKeyRepository } from '../modules/api-key/domain/api-key.repository';

export class InMemoryKeys extends ApiKeyRepository {
  keys: ApiKey[] = [];
  async create(k: ApiKey) {
    this.keys.push(k);
  }
  async list(tenantId: string) {
    return this.keys.filter((k) => k.tenantId === tenantId);
  }
  async findByHash(hash: string) {
    return this.keys.find((k) => k.hash === hash) ?? null;
  }
  async revoke(_: string, id: string, at: string) {
    const key = this.keys.find((k) => k.id === id);
    if (key) key.revokedAt = at;
    return !!key;
  }
  async touch() {}
  async setScope(tenantId: string, id: string, endpointIds: string[] | null) {
    const key = this.keys.find((k) => k.id === id && k.tenantId === tenantId && !k.revokedAt);
    if (!key) return null;
    key.endpointIds = endpointIds;
    return key;
  }
}
