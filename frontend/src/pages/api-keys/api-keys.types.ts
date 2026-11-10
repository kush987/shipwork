import type { ApiEndpoint, ApiKey, CreatedApiKey } from '../../api/types';

/** all = every endpoint that uses API-key auth (endpointIds: null) · some = only the listed ones. */
export type ScopeMode = 'all' | 'some';

export interface CreateKeyModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (c: CreatedApiKey) => void;
}

export interface SecretModalProps {
  created: CreatedApiKey | null;
  onClose: () => void;
}

export interface EndpointScopeFieldProps {
  /** null = all API-key endpoints. */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  endpoints: ApiEndpoint[] | undefined;
}

export interface EditScopeModalProps {
  apiKey: ApiKey | null;
  onClose: () => void;
}

export interface ScopeCellProps {
  apiKey: ApiKey;
  endpoints: ApiEndpoint[] | undefined;
}
