import { Injectable } from '@nestjs/common';
import { ApiKeyService } from '../../api-key/application/api-key.service';
import { AuthOutcome, EndpointAuthenticator } from './endpoint-authenticators.types';
import { TokenService } from '../../app-auth/application/token.service';
import { TokenError } from '../../app-auth/application/token.service.errors';
import { NotFoundError } from '../../../shared/domain/errors';
import type { ApiEndpoint } from '../../endpoint/domain/api-endpoint.types';
import type { InboundRequest } from './gateway.types';

@Injectable()
export class PublicAuthenticator implements EndpointAuthenticator {
  readonly scheme = 'none' as const;

  async authenticate(): Promise<AuthOutcome> {
    return { ok: true, principal: null };
  }
}

const header = (headers: InboundRequest['headers'], name: string) => {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
};

const bearer = (headers: InboundRequest['headers']) => header(headers, 'authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];

/** `x-api-key: <secret>` or `Authorization: Bearer <secret>`; a scoped key only calls its endpoints. */
@Injectable()
export class ApiKeyAuthenticator implements EndpointAuthenticator {
  readonly scheme = 'api_key' as const;

  constructor(private readonly keys: ApiKeyService) {}

  async authenticate(tenantId: string, headers: InboundRequest['headers'], endpoint: ApiEndpoint): Promise<AuthOutcome> {
    const secret = header(headers, 'x-api-key') ?? bearer(headers);
    if (!secret) return { ok: false, status: 401, message: 'This endpoint needs an API key: send it as x-api-key (or Authorization: Bearer …)' };
    const key = await this.keys.authenticate(tenantId, secret);
    if (!key) return { ok: false, status: 401, message: 'The API key is invalid or has been revoked' };
    if (key.endpointIds && !key.endpointIds.includes(endpoint.id)) return { ok: false, status: 403, message: 'This API key may not call this endpoint' };
    return { ok: true, principal: { type: 'api_key', id: key.id, name: key.name, roles: [], claims: {}, context: {} } };
  }
}

/** `Authorization: Bearer <token>` from the endpoint's sign-in provider (the workspace's app users). */
@Injectable()
export class JwtAuthenticator implements EndpointAuthenticator {
  readonly scheme = 'jwt' as const;

  constructor(private readonly tokens: TokenService) {}

  async authenticate(tenantId: string, headers: InboundRequest['headers'], endpoint: ApiEndpoint): Promise<AuthOutcome> {
    const token = bearer(headers);
    if (!token) return { ok: false, status: 401, message: 'Sign in first: send Authorization: Bearer <token>' };
    try {
      const verified = await this.tokens.verify(tenantId, endpoint.authProviderId ?? '', token);
      return {
        ok: true,
        principal: { type: 'jwt', id: verified.sub, sub: verified.sub, roles: verified.roles, claims: verified.claims, provider: endpoint.authProviderId!, context: {} },
      };
    } catch (error) {
      if (error instanceof TokenError) return { ok: false, status: 401, message: error.message };
      if (error instanceof NotFoundError) return { ok: false, status: 401, message: 'This endpoint’s sign-in provider no longer exists' };
      throw error;
    }
  }
}
