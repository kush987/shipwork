import type { AuthProvider, AuthProviderType } from '../../api/types';

/** The create/edit dialog's fields, as typed (numbers stay text until saved). */
export interface ProviderForm {
  name: string;
  type: AuthProviderType;
  issuer: string;
  audience: string;
  jwksUrl: string;
  /** Empty when editing = keep the stored secret. */
  secret: string;
  rolesClaim: string;
  tokenTtlMinutes: string;
}

export interface ProviderModalProps {
  open: boolean;
  /** null = create a new provider. */
  provider: AuthProvider | null;
  onClose: () => void;
}

export interface ProviderToolProps {
  provider: AuthProvider | null;
  onClose: () => void;
}

/** A record of `app_users` as the test-token form offers it: who to sign in as, with their roles. */
export interface AppUser {
  id: string;
  label: string;
  roles: string[];
}

export interface TestTokenFormProps {
  provider: AuthProvider;
  /** Called with the new token (and its expiry). */
  onIssued: (token: string, expiresAt: string) => void;
  /** Smaller layout for the endpoint Try-it console. */
  compact?: boolean;
}

export interface ProviderRowProps {
  provider: AuthProvider;
  canEdit: boolean;
  onEdit: () => void;
  onCheck: () => void;
  onTestToken: () => void;
}
