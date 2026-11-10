import type { AuthProvider } from './app-auth.types';

export abstract class AuthProviderRepository {
  abstract list(tenantId: string): Promise<AuthProvider[]>;
  abstract find(tenantId: string, id: string): Promise<AuthProvider | null>;
  abstract save(provider: AuthProvider): Promise<void>;
  abstract delete(tenantId: string, id: string): Promise<void>;
}
