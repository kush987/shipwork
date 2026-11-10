import { Injectable } from '@nestjs/common';
import { createLocalJWKSet, errors as joseErrors, jwtVerify, SignJWT, type JWTPayload, type JWTVerifyResult } from 'jose';
import { decryptSecret } from '../../../shared/security/encryption';
import { InvalidOperationError } from '../../../shared/domain/errors';
import { AuthProviderService } from './auth-provider.service';
import { JwksSource } from './app-auth.ports';
import { ASYMMETRIC_ALGORITHMS, CLOCK_TOLERANCE_SECONDS, HMAC_ALGORITHMS } from '../domain/app-auth.constants';
import { rolesFrom } from '../domain/app-auth';
import type { AuthProvider, IssueTokenInput, VerifiedToken } from '../domain/app-auth.types';
import { TokenError } from './token.service.errors';

const secretKey = (p: AuthProvider) => new TextEncoder().encode(decryptSecret(p.encryptedSecret!));

/** Plain-words reasons for a rejected token (never echoing the token itself). */
function explain(error: unknown): string {
  if (error instanceof joseErrors.JWTExpired) return 'The token has expired';
  if (error instanceof joseErrors.JWTClaimValidationFailed) return `The token's ${error.claim} claim is not what this provider expects`;
  if (error instanceof joseErrors.JWSSignatureVerificationFailed) return 'The token signature is not valid';
  if (error instanceof joseErrors.JWKSNoMatchingKey) return 'No key of the identity provider matches this token';
  if (error instanceof joseErrors.JOSEAlgNotAllowed) return 'The token is signed with an algorithm this provider does not accept';
  if (error instanceof joseErrors.JWSInvalid || error instanceof joseErrors.JWTInvalid) return 'Not a valid token';
  return (error as Error).message ?? 'The token could not be verified';
}

/**
 * Verifies end-user tokens for endpoints with JWT auth, and issues tokens for ShipFlow-issued
 * providers (the Issue token step of a Login API). Issuer, audience, expiry and algorithm are
 * always checked; "none" and algorithm confusion are impossible (fixed algorithm list per type).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly providers: AuthProviderService,
    private readonly jwks: JwksSource,
  ) {}

  async verify(tenantId: string, providerId: string, token: string): Promise<VerifiedToken> {
    const provider = await this.providers.require(tenantId, providerId);
    let result: JWTVerifyResult;
    try {
      result = await this.verifyWith(provider, token);
    } catch (error) {
      throw new TokenError(explain(error));
    }
    const claims = result.payload as JWTPayload & Record<string, unknown>;
    if (!claims.sub) throw new TokenError('The token has no subject (sub)');
    return { sub: String(claims.sub), roles: rolesFrom(claims, provider.rolesClaim), claims, expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null };
  }

  async issue(tenantId: string, providerId: string, input: IssueTokenInput): Promise<{ token: string; expiresAt: string }> {
    const provider = await this.providers.require(tenantId, providerId);
    if (provider.type !== 'shipflow') throw new InvalidOperationError('Only ShipFlow-issued sign-in providers can issue tokens');
    if (!input.sub) throw new InvalidOperationError('A token needs a subject (the user id)');
    const minutes = input.expiresInMinutes ?? provider.tokenTtlMinutes;
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    const jwt = new SignJWT({ ...(input.claims ?? {}), [provider.rolesClaim]: input.roles ?? [] })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(provider.issuer)
      .setSubject(input.sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000));
    if (provider.audience) jwt.setAudience(provider.audience);
    return { token: await jwt.sign(secretKey(provider)), expiresAt: expiresAt.toISOString() };
  }

  private async verifyWith(provider: AuthProvider, token: string) {
    const options = { issuer: provider.issuer, ...(provider.audience ? { audience: provider.audience } : {}), clockTolerance: CLOCK_TOLERANCE_SECONDS };
    if (provider.type !== 'jwks') return jwtVerify(token, secretKey(provider), { ...options, algorithms: HMAC_ALGORITHMS });
    try {
      return await jwtVerify(token, createLocalJWKSet(await this.jwks.keys(provider)), { ...options, algorithms: ASYMMETRIC_ALGORITHMS });
    } catch (error) {
      // The provider may have rotated its keys since we cached them: read them again once.
      if (!(error instanceof joseErrors.JWKSNoMatchingKey)) throw error;
      return jwtVerify(token, createLocalJWKSet(await this.jwks.keys(provider, true)), { ...options, algorithms: ASYMMETRIC_ALGORITHMS });
    }
  }
}
