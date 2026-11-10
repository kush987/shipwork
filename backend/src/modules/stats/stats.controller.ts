import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../shared/tenant/tenant.decorator';
import { WorkflowService } from '../workflow/application/workflow.service';
import { ExecutionService } from '../execution/application/execution.service';
import { ShipmentService } from '../shipment/application/shipment.service';
import { EndpointService } from '../endpoint/application/endpoint.service';
import { DataService } from '../data/application/data.service';
import { Area } from '../../shared/auth/auth.decorators';

@ApiTags('stats')
@Area('dashboard')
@Controller('stats')
export class StatsController {
  constructor(
    private readonly workflows: WorkflowService,
    private readonly executions: ExecutionService,
    private readonly shipments: ShipmentService,
    private readonly endpoints: EndpointService,
    private readonly data: DataService,
  ) {}

  @Get()
  async stats(@TenantId() tenantId: string) {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [workflows, published, executions24h, succeeded, failed, shipments, recentExecutions, endpoints, apiCalls24h, collections] = await Promise.all([
      this.workflows.count(tenantId),
      this.workflows.count(tenantId, { status: 'published' }),
      this.executions.count(tenantId, { since }),
      this.executions.count(tenantId, { since, status: 'succeeded' }),
      this.executions.count(tenantId, { since, status: 'failed' }),
      this.shipments.count(tenantId),
      this.executions.list(tenantId, {}, 5),
      this.endpoints.count(tenantId),
      this.executions.count(tenantId, { since, mode: 'api' }),
      this.data.countCollections(tenantId),
    ]);
    const finished = succeeded + failed;
    return {
      workflows,
      published,
      executions24h,
      successRate: finished ? succeeded / finished : 0,
      shipments,
      endpoints,
      apiCalls24h,
      collections,
      recentExecutions,
    };
  }
}
