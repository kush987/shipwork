import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { EndpointService } from '../application/endpoint.service';
import { EndpointDto } from './endpoint.dto';
import { Area } from '../../../shared/auth/auth.decorators';

@ApiTags('endpoints')
@Area('endpoints')
@Controller('endpoints')
export class EndpointController {
  constructor(private readonly endpoints: EndpointService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.endpoints.list(tenantId);
  }

  /** Declared before `:id` so it isn't read as an endpoint id. */
  @Get('openapi.json')
  openApi(@TenantId() tenantId: string) {
    return this.endpoints.openApi(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: EndpointDto) {
    return this.endpoints.create(tenantId, dto);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.endpoints.get(tenantId, id);
  }

  @Put(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: EndpointDto) {
    return this.endpoints.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.endpoints.delete(tenantId, id);
  }
}
