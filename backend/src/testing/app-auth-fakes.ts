import type { JSONWebKeySet } from 'jose';
import { AuthProviderRepository } from '../modules/app-auth/domain/app-auth.repository';
import { JwksSource } from '../modules/app-auth/application/app-auth.ports';
import { AuthProviderService } from '../modules/app-auth/application/auth-provider.service';
import { TokenService } from '../modules/app-auth/application/token.service';
import type { AuthProvider } from '../modules/app-auth/domain/app-auth.types';

export class InMemoryAuthProviders extends AuthProviderRepository {
  readonly rows = new Map<string, AuthProvider>();
  async list(tenantId: string) {
    return [...this.rows.values()].filter((p) => p.tenantId === tenantId);
  }
  async find(tenantId: string, id: string) {
    const p = this.rows.get(id);
    return p && p.tenantId === tenantId ? structuredClone(p) : null;
  }
  async save(p: AuthProvider) {
    this.rows.set(p.id, structuredClone(p));
  }
  async delete(_: string, id: string) {
    this.rows.delete(id);
  }
}

/**
 * An identity provider's JWKS as the real source sees it: `keySet` is what the provider publishes
 * now; reads are cached until a refresh is forced (as on an unknown key id). Counts reads.
 */
export class FakeJwks extends JwksSource {
  reads = 0;
  private cached?: JSONWebKeySet;
  constructor(public keySet: JSONWebKeySet = { keys: [] }) {
    super();
  }
  async keys(_provider?: unknown, refresh = false) {
    if (!this.cached || refresh) {
      this.cached = this.keySet;
      this.reads++;
    }
    return this.cached;
  }
}

export function appAuthFixture(jwks = new FakeJwks()) {
  const providers = new AuthProviderService(new InMemoryAuthProviders());
  return { providers, tokens: new TokenService(providers, jwks), jwks };
}
