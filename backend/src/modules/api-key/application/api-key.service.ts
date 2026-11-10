import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { generateSecret, hashSecret, looksLikeSecret, toApiKeyView } from '../domain/api-key';
import { TOUCH_INTERVAL_MS } from './api-key.service.constants';
import { ApiKey, ApiKeyView } from '../domain/api-key.types';
import { ApiKeyRepository } from '../domain/api-key.repository';
import { uniq } from 'lodash';

/** A key limited to no endpoint at all is surely a mistake; duplicates are dropped. */
function normalizeScope(endpointIds: string[] | null | undefined): string[] | null {
  if (endpointIds === null || endpointIds === undefined) return null;
  const ids = uniq(endpointIds.map((id) => id.trim()).filter(Boolean));
  if (!ids.length) throw new ValidationFailedError([{ message: 'Choose at least one endpoint, or allow all endpoints' }]);
  return ids;
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly keys: ApiKeyRepository) {}

  async list(tenantId: string): Promise<ApiKeyView[]> {
    return (await this.keys.list(tenantId)).map(toApiKeyView);
  }

  /** Returns the secret exactly once; afterwards only its hash exists. */
  async create(tenantId: string, name: string, endpointIds: string[] | null = null): Promise<{ apiKey: ApiKeyView; secret: string }> {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80) throw new ValidationFailedError([{ message: 'Name must be 1–80 characters' }]);
    const scope = normalizeScope(endpointIds);
    const secret = generateSecret();
    const key: ApiKey = {
      id: newId('key'),
      tenantId,
      name: trimmed,
      prefix: secret.slice(0, 10),
      hash: hashSecret(secret),
      endpointIds: scope,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    await this.keys.create(key);
    return { apiKey: toApiKeyView(key), secret };
  }

  /** Limit the key to some endpoints (a list), or allow all API-key endpoints again (null). */
  async setScope(tenantId: string, id: string, endpointIds: string[] | null): Promise<ApiKeyView> {
    const key = await this.keys.setScope(tenantId, id, normalizeScope(endpointIds));
    if (!key) throw new NotFoundError('API key', id);
    return toApiKeyView(key);
  }

  async revoke(tenantId: string, id: string): Promise<void> {
    if (!(await this.keys.revoke(tenantId, id, new Date().toISOString()))) throw new NotFoundError('API key', id);
  }

  /** The active key of `tenantId` with this secret, or null. */
  async authenticate(tenantId: string, secret: string): Promise<ApiKeyView | null> {
    if (!looksLikeSecret(secret)) return null;
    const key = await this.keys.findByHash(hashSecret(secret));
    if (!key || key.tenantId !== tenantId || key.revokedAt) return null;
    const now = new Date();
    if (!key.lastUsedAt || now.getTime() - Date.parse(key.lastUsedAt) > TOUCH_INTERVAL_MS) {
      void this.keys.touch(key.id, now.toISOString()).catch(() => undefined);
    }
    return toApiKeyView(key);
  }
}
