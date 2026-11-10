import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Area, CurrentAuth, Permission } from '../../../shared/auth/auth.decorators';
import type { AuthContext } from '../../../shared/auth/auth.types';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { MembersService } from '../application/members.service';
import { AddMemberDto, ChangeRoleDto } from './dto/auth.dto';

/** People in the current workspace (members:read to see them, members:manage to change them). */
@ApiTags('members')
@Area('members')
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.members.list(tenantId);
  }

  @Permission('members:manage')
  @Post()
  add(@TenantId() tenantId: string, @Body() dto: AddMemberDto, @CurrentAuth() auth: AuthContext) {
    return this.members.add(tenantId, dto, auth);
  }

  @Permission('members:manage')
  @Patch(':userId')
  changeRole(@TenantId() tenantId: string, @Param('userId') userId: string, @Body() dto: ChangeRoleDto, @CurrentAuth() auth: AuthContext) {
    return this.members.changeRole(tenantId, userId, dto.role, auth);
  }

  @Permission('members:manage')
  @Delete(':userId')
  @HttpCode(204)
  remove(@TenantId() tenantId: string, @Param('userId') userId: string, @CurrentAuth() auth: AuthContext) {
    return this.members.remove(tenantId, userId, auth);
  }
}
