import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseBoolPipe, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { CustomNodeService } from '../application/custom-node.service';
import { CustomNodeSpecDto } from './dto/custom-node-spec.dto';
import { TestDto } from './dto/test.dto';
import { Area } from '../../../shared/auth/auth.decorators';

@ApiTags('custom-nodes')
@Area('custom-nodes')
@Controller('custom-nodes')
export class CustomNodeController {
  constructor(private readonly customNodes: CustomNodeService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query('includeArchived', new DefaultValuePipe(false), ParseBoolPipe) includeArchived: boolean) {
    return this.customNodes.list(tenantId, includeArchived);
  }

  /** Ready-made starting points; registered before `:id` so "templates" isn't read as an id. */
  @Get('templates')
  templates() {
    return this.customNodes.templates();
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CustomNodeSpecDto) {
    return this.customNodes.create(tenantId, dto);
  }

  @Post('test')
  @HttpCode(200)
  test(@Body() dto: TestDto) {
    const { input, ...spec } = dto;
    return this.customNodes.test(spec, input);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customNodes.get(tenantId, id);
  }

  @Get(':id/versions/:version')
  version(@TenantId() tenantId: string, @Param('id') id: string, @Param('version', ParseIntPipe) version: number) {
    return this.customNodes.getVersion(tenantId, id, version);
  }

  @Put(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: CustomNodeSpecDto) {
    return this.customNodes.update(tenantId, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customNodes.setArchived(tenantId, id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customNodes.setArchived(tenantId, id, false);
  }
}
