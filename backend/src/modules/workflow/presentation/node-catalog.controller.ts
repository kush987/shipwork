import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NodeResolver } from '../../nodes/node-resolver';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { Area } from '../../../shared/auth/auth.decorators';

@ApiTags('catalog')
@Area('workflows')
@Controller()
export class NodeCatalogController {
  constructor(private readonly nodes: NodeResolver) {}

  @Get('nodes/catalog')
  catalog(@TenantId() tenantId: string) {
    return this.nodes.catalog(tenantId);
  }
}
