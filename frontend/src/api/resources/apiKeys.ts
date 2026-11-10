import { request } from '../http';
import type { ApiKey, ApiKeyInput, CreatedApiKey } from '../types';

export const apiKeysApi = {
  listApiKeys: () => request<ApiKey[]>('GET', '/api-keys'),
  /** The secret in the response is shown only once. */
  createApiKey: (input: ApiKeyInput) => request<CreatedApiKey>('POST', '/api-keys', input),
  /** null = every endpoint that uses API-key auth. */
  updateApiKeyScope: (id: string, endpointIds: string[] | null) => request<ApiKey>('PATCH', `/api-keys/${id}`, { endpointIds }),
  revokeApiKey: (id: string) => request<void>('DELETE', `/api-keys/${id}`),
};
