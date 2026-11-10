import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseBoolPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { WarehouseService } from '../application/warehouse.service';
import { WarehouseDto } from './dto/warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { Area } from '../../../shared/auth/auth.decorators';

@ApiTags('warehouses')
@Area('warehouses')
@Controller('warehouses')
export class WarehouseController {
  constructor(private readonly warehouses: WarehouseService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe) includeInactive: boolean,
  ) {
    return this.warehouses.list(tenantId, includeInactive);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: WarehouseDto) {
    return this.warehouses.create(tenantId, dto);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.warehouses.get(tenantId, id);
  }

  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouses.update(tenantId, id, dto);
  }

  @Delete(':id')
  deactivate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.warehouses.deactivate(tenantId, id);
  }

  @Post(':id/reactivate')
  reactivate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.warehouses.reactivate(tenantId, id);
  }
}
