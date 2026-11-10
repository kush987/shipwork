import { PROVIDER_TYPES } from './app-auth.constants';

/**
 * shipflow: tokens issued by the workspace's own Login API (Issue token step), HS256 with a secret
 * ShipFlow generates · jwks: an external identity provider (Auth0, Firebase, Cognito, Keycloak…)
 * publishing its keys · secret: tokens signed with a shared HS256 secret.
 */
export type AuthProviderType = (typeof PROVIDER_TYPES)[number];

/** How a workspace's apps sign their users in; endpoints with `auth: 'jwt'` name one. */
export interface AuthProvider {
  id: string;
  tenantId: string;
  name: string;
  type: AuthProviderType;
  issuer: string;
  audience: string | null;
  jwksUrl: string | null;
  /** AES-GCM encrypted HS256 secret (shipflow, secret). */
  encryptedSecret: string | null;
  /** Claim (dot path) holding the user's roles. */
  rolesClaim: string;
  tokenTtlMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export type AuthProviderView = Omit<AuthProvider, 'tenantId' | 'encryptedSecret'> & { hasSecret: boolean };

export interface AuthProviderInput {
  name: string;
  type: AuthProviderType;
  issuer?: string;
  audience?: string | null;
  jwksUrl?: string | null;
  secret?: string;
  rolesClaim?: string;
  tokenTtlMinutes?: number;
}

/** What ShipFlow takes from a valid token. */
export interface VerifiedToken {
  sub: string;
  roles: string[];
  claims: Record<string, unknown>;
  expiresAt: string | null;
}

export interface IssueTokenInput {
  sub: string;
  roles?: string[];
  claims?: Record<string, unknown>;
  expiresInMinutes?: number;
}
