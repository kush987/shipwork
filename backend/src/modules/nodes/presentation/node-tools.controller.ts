import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { OutboundHttp, OutboundHttpError } from '../../../shared/http/outbound-http';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { runFetch, leafPaths } from '../implementations/integration/fetch-data';
import { DomainError, NonRetryableError } from '../../../shared/domain/errors';
import type { ExecutionData } from '../domain/workflow-node.types';
import { FetchTestDto } from './dto/fetch-test.dto';
import { Area } from '../../../shared/auth/auth.decorators';

/** Builder helpers that run a node's request without running a workflow. */
@ApiTags('nodes')
@Area('workflows')
@Controller('nodes')
export class NodeToolsController {
  constructor(
    private readonly http: OutboundHttp,
    private readonly shipments: ShipmentService,
  ) {}

  @Post('fetch-data/test')
  @HttpCode(200)
  async testFetch(@TenantId() tenantId: string, @Body() dto: FetchTestDto) {
    const shipment = dto.shipmentId ? await this.shipments.get(tenantId, dto.shipmentId) : (await this.shipments.list(tenantId, 1))[0] ?? null;
    const data: ExecutionData = { shipment, request: null, context: dto.context ?? {}, trigger: { event: 'manual.test', data: {} } };
    const sample = shipment ? { id: shipment.id, orderId: shipment.orderId } : null;
    try {
      const { request, response, saved, missing } = await runFetch(this.http, dto.config, data);
      const bodyText = typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2);
      return {
        ok: response.ok,
        sample,
        request,
        status: response.status,
        durationMs: response.durationMs,
        saved,
        missing,
        body: bodyText.length > 64_000 ? `${bodyText.slice(0, 64_000)}\n… (truncated)` : bodyText,
        paths: [{ path: 'status', preview: String(response.status) }, ...leafPaths(response.body, 'body')],
      };
    } catch (error) {
      if (error instanceof OutboundHttpError || error instanceof NonRetryableError || error instanceof DomainError) {
        return { ok: false, sample, error: error.message };
      }
      throw error;
    }
  }
}
