import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { requireFound } from '../../../shared/domain/guards';
import { newId } from '../../../shared/domain/id';
import { encryptSecret } from '../../../shared/security/encryption';
import { AuthProviderRepository } from '../domain/app-auth.repository';
import { DEFAULT_ROLES_CLAIM, GENERATED_SECRET_BYTES, TOKEN_TTL_MINUTES } from '../domain/app-auth.constants';
import { providerIssues, shipflowIssuer } from '../domain/app-auth';
import type { AuthProvider, AuthProviderInput } from '../domain/app-auth.types';

/** A workspace's sign-in providers for the apps it builds. Secrets are stored encrypted and never returned. */
@Injectable()
export class AuthProviderService {
  constructor(private readonly providers: AuthProviderRepository) {}

  list(tenantId: string) {
    return this.providers.list(tenantId);
  }

  async require(tenantId: string, id: string): Promise<AuthProvider> {
    return requireFound(await this.providers.find(tenantId, id), 'Sign-in provider', id);
  }

  async exists(tenantId: string, id: string) {
    return !!(await this.providers.find(tenantId, id));
  }

  async create(tenantId: string, input: AuthProviderInput): Promise<AuthProvider> {
    this.check(input);
    const id = newId('ap');
    const now = new Date().toISOString();
    const provider: AuthProvider = {
      id,
      tenantId,
      name: input.name.trim(),
      type: input.type,
      issuer: input.type === 'shipflow' ? shipflowIssuer(tenantId, id) : input.issuer!.trim(),
      audience: input.audience?.trim() || null,
      jwksUrl: input.type === 'jwks' ? input.jwksUrl!.trim() : null,
      encryptedSecret: this.secretFor(input),
      rolesClaim: input.rolesClaim?.trim() || DEFAULT_ROLES_CLAIM,
      tokenTtlMinutes: input.tokenTtlMinutes ?? TOKEN_TTL_MINUTES.default,
      createdAt: now,
      updatedAt: now,
    };
    await this.providers.save(provider);
    return provider;
  }

  async update(tenantId: string, id: string, input: AuthProviderInput): Promise<AuthProvider> {
    const current = await this.require(tenantId, id);
    this.check(input, current);
    const provider: AuthProvider = {
      ...current,
      name: input.name.trim(),
      issuer: current.type === 'shipflow' ? current.issuer : input.issuer!.trim(),
      audience: input.audience?.trim() || null,
      jwksUrl: current.type === 'jwks' ? input.jwksUrl!.trim() : null,
      // ShipFlow-issued: the generated secret stays (changing it would sign every user out).
      encryptedSecret: current.type === 'secret' && input.secret !== undefined ? encryptSecret(input.secret) : current.encryptedSecret,
      rolesClaim: input.rolesClaim?.trim() || current.rolesClaim,
      tokenTtlMinutes: input.tokenTtlMinutes ?? current.tokenTtlMinutes,
      updatedAt: new Date().toISOString(),
    };
    await this.providers.save(provider);
    return provider;
  }

  delete(tenantId: string, id: string) {
    return this.providers.delete(tenantId, id);
  }

  private check(input: AuthProviderInput, existing?: AuthProvider) {
    const issues = providerIssues(input, existing);
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
  }

  private secretFor(input: AuthProviderInput): string | null {
    if (input.type === 'shipflow') return encryptSecret(randomBytes(GENERATED_SECRET_BYTES).toString('base64url'));
    if (input.type === 'secret') return encryptSecret(input.secret!);
    return null;
  }
}
