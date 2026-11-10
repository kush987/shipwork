import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExecutionService } from '../application/execution.service';
import { TestRunService } from '../application/test-run.service';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { ExecutionMode, ExecutionStatus } from '../domain/execution.types';
import { TestRunDto } from './dto/test-run.dto';
import { RunWorkflowsDto } from './dto/run-workflows.dto';
import { Area, Permission } from '../../../shared/auth/auth.decorators';

@ApiTags('executions')
@Area('executions')
@Controller()
export class ExecutionController {
  constructor(
    private readonly executions: ExecutionService,
    private readonly testRuns: TestRunService,
  ) {}

  @Get('executions')
  list(
    @TenantId() tenantId: string,
    @Query('workflowId') workflowId?: string,
    @Query('shipmentId') shipmentId?: string,
    @Query('status') status?: ExecutionStatus,
    @Query('mode') mode?: ExecutionMode,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.executions.list(tenantId, { workflowId, shipmentId, status, mode }, Math.min(limit, 200));
  }

  @Get('executions/:id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.executions.get(tenantId, id);
  }

  @Permission('executions:run')
  @Post('executions/:id/replay')
  replay(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.executions.replay(tenantId, id);
  }

  /** Run published workflows for a shipment on demand (from its details page). */
  @Permission('shipments:run')
  @Post('shipments/:id/run-workflows')
  runForShipment(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: RunWorkflowsDto) {
    return this.executions.runForShipment(tenantId, id, dto.workflowIds, 'manual');
  }

  @Permission('workflows:run')
  @Post('workflows/:id/test')
  test(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: TestRunDto) {
    return this.testRuns.run(tenantId, id, dto);
  }
}
