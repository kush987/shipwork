import type { JSONWebKeySet } from 'jose';
import type { AuthProvider } from '../domain/app-auth.types';

/** The public keys of an external identity provider, cached; `refresh` forces a re-read (key rotation). */
export abstract class JwksSource {
  abstract keys(provider: AuthProvider, refresh?: boolean): Promise<JSONWebKeySet>;
}
