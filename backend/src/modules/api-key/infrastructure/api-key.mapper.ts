import { toDateOrNull, toIso, toIsoOrNull } from '../../../shared/persistence/mongo-mapping';
import type { ApiKey } from '../domain/api-key.types';
import type { ApiKeyDoc } from './api-key.schema';

export const toApiKey = ({ _id, createdAt, lastUsedAt, revokedAt, ...rest }: ApiKeyDoc): ApiKey => ({
  ...rest,
  endpointIds: rest.endpointIds ?? null,
  id: _id,
  createdAt: toIso(createdAt),
  lastUsedAt: toIsoOrNull(lastUsedAt),
  revokedAt: toIsoOrNull(revokedAt),
});

export const toApiKeyDoc = ({ id, createdAt, lastUsedAt, revokedAt, ...rest }: ApiKey) => ({
  ...rest,
  _id: id,
  createdAt: new Date(createdAt),
  lastUsedAt: toDateOrNull(lastUsedAt),
  revokedAt: toDateOrNull(revokedAt),
});
