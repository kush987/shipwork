import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShipmentService } from '../application/shipment.service';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { ShipmentBookingService } from '../application/shipment-booking.service';
import { ShipmentDispatchService } from '../application/shipment-dispatch.service';
import { ShipmentCancellationService } from '../application/shipment-cancellation.service';
import {
  AssignCourierDto,
  BulkIdsDto,
  BulkTriggerDto,
  CancelShipmentDto,
  CreateShipmentDto,
  QuoteDto,
  ShipmentStatusDto,
  UpdateShipmentDto,
} from './shipment.dto';
import { Area, Permission } from '../../../shared/auth/auth.decorators';

@ApiTags('shipments')
@Area('shipments')
@Controller('shipments')
export class ShipmentController {
  constructor(
    private readonly shipments: ShipmentService,
    private readonly booking: ShipmentBookingService,
    private readonly dispatch: ShipmentDispatchService,
    private readonly cancellation: ShipmentCancellationService,
  ) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('awaitingTrigger', new DefaultValuePipe(false), ParseBoolPipe) awaitingTrigger: boolean,
  ) {
    return this.shipments.list(tenantId, Math.min(limit, 200), { awaitingTrigger });
  }

  /** `dispatch.mode = auto` (default) triggers immediately; `manual` waits for a trigger. */
  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateShipmentDto) {
    const { dispatch, ...input } = dto;
    return this.dispatch.create(tenantId, input, dispatch && { mode: dispatch.mode, courier: dispatch.courier ?? null });
  }

  @Permission('shipments:read')
  @Post('quote')
  @HttpCode(200)
  quote(@TenantId() tenantId: string, @Body() dto: QuoteDto) {
    return this.booking.quote(tenantId, dto);
  }

  @Permission('shipments:run')
  @Post('trigger')
  @HttpCode(200)
  bulkTrigger(@TenantId() tenantId: string, @Body() dto: BulkTriggerDto) {
    return this.dispatch.bulkTrigger(tenantId, dto.ids, dto.courier);
  }

  @Permission('shipments:read')
  @Post('bulk-courier-options')
  @HttpCode(200)
  bulkCourierOptions(@TenantId() tenantId: string, @Body() dto: BulkIdsDto) {
    return this.dispatch.bulkCourierOptions(tenantId, dto.ids);
  }

  @Permission('shipments:run')
  @Post(':id/trigger')
  @HttpCode(200)
  trigger(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.dispatch.trigger(tenantId, id, 'manual');
  }

  /** Cancels the courier booking (if any), then the shipment; emits `shipment.cancelled`. */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: CancelShipmentDto) {
    return this.cancellation.cancel(tenantId, id, dto.reason.trim(), 'manual');
  }

  @Put(':id/selected-courier')
  selectCourier(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: AssignCourierDto) {
    return this.dispatch.selectCourier(tenantId, id, dto.courier);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.shipments.get(tenantId, id);
  }

  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateShipmentDto) {
    return this.shipments.updateDetails(tenantId, id, dto, 'manual');
  }

  @Get(':id/courier-options')
  courierOptions(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.booking.courierOptions(tenantId, id);
  }

  @Post(':id/assign')
  assign(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: AssignCourierDto) {
    return this.booking.assign(tenantId, id, dto.courier);
  }

  @Post(':id/events')
  simulateStatus(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: ShipmentStatusDto) {
    return this.shipments.applyStatus(tenantId, id, dto.status, 'simulator');
  }
}
