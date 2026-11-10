import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Area } from '../../../shared/auth/auth.decorators';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { AuditService } from '../application/audit.service';
import type { AuditQuery } from '../domain/audit.types';

/** Who changed what in this workspace, and what was denied. Newest first, paged with `before`. */
@ApiTags('audit')
@Area('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query() query: AuditQuery) {
    return this.audit.list(tenantId, query);
  }
}
