import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { InvalidOperationError } from '../../../shared/domain/errors';
import { AuthProviderService } from '../../app-auth/application/auth-provider.service';
import { TokenService } from '../../app-auth/application/token.service';
import { TokenError } from '../../app-auth/application/token.service.errors';
import { toProviderView } from '../../app-auth/domain/app-auth';
import { EndpointService } from '../application/endpoint.service';
import { AuthProviderDto, IssueTestTokenDto, VerifyTokenDto } from './auth-providers.dto';
import { Area, Permission } from '../../../shared/auth/auth.decorators';

/**
 * Sign-in providers of the apps a workspace builds (used by endpoints with JWT auth). Part of the
 * endpoint module: they are API security settings, and deleting one must check its endpoints.
 */
@ApiTags('auth-providers')
@Area('auth-providers')
@Controller('auth-providers')
export class AuthProvidersController {
  constructor(
    private readonly providers: AuthProviderService,
    private readonly tokens: TokenService,
    private readonly endpoints: EndpointService,
  ) {}

  @Get()
  async list(@TenantId() tenantId: string) {
    const [providers, usage] = await Promise.all([this.providers.list(tenantId), this.endpoints.providerUsage(tenantId)]);
    return providers.map((p) => ({ ...toProviderView(p), endpointCount: usage[p.id] ?? 0 }));
  }

  @Post()
  async create(@TenantId() tenantId: string, @Body() dto: AuthProviderDto) {
    return { ...toProviderView(await this.providers.create(tenantId, dto)), endpointCount: 0 };
  }

  @Put(':id')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: AuthProviderDto) {
    const [provider, usage] = await Promise.all([this.providers.update(tenantId, id, dto), this.endpoints.providerUsage(tenantId)]);
    return { ...toProviderView(provider), endpointCount: usage[id] ?? 0 };
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.providers.require(tenantId, id);
    const used = (await this.endpoints.providerUsage(tenantId))[id] ?? 0;
    if (used) throw new InvalidOperationError(`${used} endpoint${used === 1 ? '' : 's'} sign callers in with this provider — change them first`);
    await this.providers.delete(tenantId, id);
  }

  /** Paste a token to see whether it is accepted and what ShipFlow reads from it. */
  @Permission('auth-providers:read')
  @Post(':id/verify')
  @HttpCode(200)
  async verify(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: VerifyTokenDto) {
    try {
      return { ok: true, ...(await this.tokens.verify(tenantId, id, dto.token.trim())) };
    } catch (error) {
      if (error instanceof TokenError) return { ok: false, error: error.message };
      throw error;
    }
  }

  /** A token for trying JWT endpoints (ShipFlow-issued providers only). */
  @Post(':id/issue-test-token')
  @HttpCode(200)
  issueTestToken(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: IssueTestTokenDto) {
    return this.tokens.issue(tenantId, id, dto);
  }
}
