// Sign-in providers for endpoints that use JWT auth (docs/API_CONTRACT.md).

/** shipflow: tokens issued by the workflow's "Issue token" step · jwks: an external IdP · secret: a shared HS256 secret. */
export type AuthProviderType = 'shipflow' | 'jwks' | 'secret';

export interface AuthProvider {
  id: string;
  name: string;
  type: AuthProviderType;
  /** shipflow: generated, e.g. 'shipflow:demo:ap_x1'; jwks/secret: the IdP's issuer (iss) */
  issuer: string;
  /** expected aud (optional) */
  audience: string | null;
  /** jwks only: https URL of the IdP's JSON Web Key Set */
  jwksUrl: string | null;
  /** token claim (dot path) holding roles; default 'roles' */
  rolesClaim: string;
  /** shipflow only: lifetime of tokens the Issue token step creates (minutes) */
  tokenTtlMinutes: number;
  /** shipflow/secret: a signing secret is stored (never returned) */
  hasSecret: boolean;
  /** endpoints using it */
  endpointCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST /auth-providers and PUT /auth-providers/:id (type can't change on update; omitted secret keeps the stored one). */
export interface AuthProviderInput {
  name: string;
  type: AuthProviderType;
  issuer?: string;
  audience?: string;
  jwksUrl?: string;
  secret?: string;
  rolesClaim?: string;
  tokenTtlMinutes?: number;
}

/** POST /auth-providers/:id/verify — what ShipFlow reads from a token. */
export type TokenCheck =
  | { ok: true; sub: string; roles: string[]; claims: Record<string, unknown>; expiresAt: string | null }
  | { ok: false; error: string };

/** Body of POST /auth-providers/:id/issue-test-token (ShipFlow-issued providers only). */
export interface TestTokenInput {
  sub: string;
  roles?: string[];
  claims?: Record<string, unknown>;
  expiresInMinutes?: number;
}

export interface TestToken {
  token: string;
  expiresAt: string;
}
