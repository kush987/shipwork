// API keys (docs/API_CONTRACT.md).

export interface ApiKey {
  id: string;
  name: string;
  /** first characters, for recognition */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
  /** Endpoints this key may call; null = every endpoint that uses API-key auth. */
  endpointIds: string[] | null;
}

/** Body of POST /api-keys. */
export interface ApiKeyInput {
  name: string;
  endpointIds?: string[] | null;
}

export interface CreatedApiKey {
  apiKey: ApiKey;
  /** shown only once */
  secret: string;
}
