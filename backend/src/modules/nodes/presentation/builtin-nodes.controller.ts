import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { Area, CurrentAuth, Permission } from '../../../shared/auth/auth.decorators';
import { BuiltinNodeEditService } from '../application/builtin-node-edits.service';
import { BuiltinNodeEditDto } from './dto/builtin-node-edit.dto';
import type { AuthContext } from '../../../shared/auth/auth.types';

const RESOURCE = { resourceType: 'builtin-node', param: 'type' } as const;

/**
 * Built-in steps as a workspace has changed them (Nodes page). There is no delete: built-in steps
 * belong to the app — "Reset to default" undoes a workspace's changes instead.
 */
@ApiTags('builtin-nodes')
@Area('custom-nodes')
@Controller('builtin-nodes')
export class BuiltinNodesController {
  constructor(private readonly edits: BuiltinNodeEditService) {}

  @Get()
  @Permission('custom-nodes:read', { resourceType: 'builtin-node' })
  list(@TenantId() tenantId: string) {
    return this.edits.list(tenantId);
  }

  @Get(':type')
  @Permission('custom-nodes:read', RESOURCE)
  get(@TenantId() tenantId: string, @Param('type') type: string) {
    return this.edits.get(tenantId, type);
  }

  @Put(':type')
  @Permission('custom-nodes:write', RESOURCE)
  save(@TenantId() tenantId: string, @Param('type') type: string, @Body() dto: BuiltinNodeEditDto, @CurrentAuth() auth: AuthContext) {
    return this.edits.save(tenantId, type, dto, auth?.email ?? null);
  }

  @Post(':type/reset')
  @HttpCode(200)
  @Permission('custom-nodes:write', RESOURCE)
  reset(@TenantId() tenantId: string, @Param('type') type: string, @CurrentAuth() auth: AuthContext) {
    return this.edits.reset(tenantId, type, auth?.email ?? null);
  }
}
