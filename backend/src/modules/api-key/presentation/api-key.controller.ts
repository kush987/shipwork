import { Body, Controller, Delete, Get, HttpCode, Param, Post, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { ApiKeyService } from '../application/api-key.service';
import { ApiKeyScopeDto, CreateApiKeyDto } from './dto/create-api-key.dto';
import { Area } from '../../../shared/auth/auth.decorators';

@ApiTags('api-keys')
@Area('api-keys')
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly keys: ApiKeyService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.keys.list(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateApiKeyDto) {
    return this.keys.create(tenantId, dto.name, dto.endpointIds ?? null);
  }

  /** Which endpoints the key may call (null = all API-key endpoints). */
  @Patch(':id')
  setScope(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: ApiKeyScopeDto) {
    return this.keys.setScope(tenantId, id, dto.endpointIds);
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.keys.revoke(tenantId, id);
  }
}
