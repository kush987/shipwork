import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnyMember, Area, CurrentAuth, Permission } from '../../../shared/auth/auth.decorators';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import type { AuthContext } from '../../../shared/auth/auth.types';
import { RolesService } from '../application/roles.service';
import { RoleDto, SimulateDto } from './dto/roles.dto';

/** Built-in and custom builder roles of the current workspace. */
@ApiTags('roles')
@Area('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.roles.list(tenantId);
  }

  @Permission('roles:manage')
  @Post()
  create(@TenantId() tenantId: string, @Body() dto: RoleDto, @CurrentAuth() auth: AuthContext) {
    return this.roles.create(tenantId, dto, auth);
  }

  @Permission('roles:manage')
  @Put(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: RoleDto, @CurrentAuth() auth: AuthContext) {
    return this.roles.update(tenantId, id, dto, auth);
  }

  @Permission('roles:manage')
  @Delete(':id')
  @HttpCode(204)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.roles.delete(tenantId, id);
  }
}

/** The permission catalog, the simulator and "what may I do here". */
@ApiTags('roles')
@Controller('access')
export class AccessController {
  constructor(private readonly roles: RolesService) {}

  @AnyMember()
  @Get('catalog')
  catalog() {
    return this.roles.catalog();
  }

  @AnyMember()
  @Get('me')
  mine(@TenantId() tenantId: string, @CurrentAuth() auth: AuthContext) {
    return this.roles.mine(tenantId, auth);
  }

  /** Answers "may this member/role do this?" exactly as the guard would. */
  @Permission('roles:read')
  @Post('simulate')
  @HttpCode(200)
  simulate(@TenantId() tenantId: string, @Body() dto: SimulateDto, @CurrentAuth() auth: AuthContext) {
    return this.roles.simulate(tenantId, dto, auth);
  }
}
