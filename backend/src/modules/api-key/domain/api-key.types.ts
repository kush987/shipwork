/** A credential for calling a tenant's endpoints. Only a hash of the secret is ever stored. */
export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  /** First characters of the secret, so people can tell keys apart. */
  prefix: string;
  hash: string;
  /** Endpoints this key may call; null = every endpoint that uses API-key auth. */
  endpointIds: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type ApiKeyView = Omit<ApiKey, 'tenantId' | 'hash' | 'revokedAt'> & { revoked: boolean };
