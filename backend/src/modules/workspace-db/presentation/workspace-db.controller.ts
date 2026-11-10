import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Area, Permission } from '../../../shared/auth/auth.decorators';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { WorkspaceDatabaseService } from '../application/workspace-db.service';
import { SwitchDatabaseDto, TestDatabaseDto } from './workspace-db.dto';

/** The current workspace's business database. Members see it; owners change it. */
@ApiTags('workspace')
@Area('database')
@Controller('workspace/database')
export class WorkspaceDatabaseController {
  constructor(private readonly databases: WorkspaceDatabaseService) {}

  @Get()
  view(@TenantId() tenantId: string) {
    return this.databases.view(tenantId);
  }

  @Permission('database:manage')
  @Post('test')
  @HttpCode(200)
  test(@TenantId() tenantId: string, @Body() dto: TestDatabaseDto) {
    return this.databases.test(tenantId, dto.uri);
  }

  @Permission('database:manage')
  @Put()
  switch(@TenantId() tenantId: string, @Body() dto: SwitchDatabaseDto) {
    const copyData = dto.copyData ?? true;
    return this.databases.switch(tenantId, dto.mode === 'external' ? { mode: 'external', uri: dto.uri!, copyData } : { mode: 'managed', copyData });
  }
}
