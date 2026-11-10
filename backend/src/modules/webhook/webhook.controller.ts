import { Body, Controller, Headers, HttpCode, Param, Post, Req, UnauthorizedException, type RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ShipmentService } from '../shipment/application/shipment.service';
import { CourierRegistry } from '../courier/application/courier-registry';
import { NotFoundError } from '../../shared/domain/errors';
import { config } from '../../config/configuration';
import { CourierWebhookDto } from './dto/courier-webhook.dto';
import { isValidHmacSignature } from '../../shared/http/signature';
import { Public } from '../../shared/auth/auth.decorators';

/**
 * Courier status push → shipment status change → domain event → workflows.
 * Real adapters would map each courier's own status vocabulary to ours here.
 */
@ApiTags('webhooks')
// Couriers call this; it is verified by the HMAC signature (WEBHOOK_SECRET), not a session.
@Public()
@Controller('webhooks/couriers')
export class WebhookController {
  constructor(
    private readonly shipments: ShipmentService,
    private readonly couriers: CourierRegistry,
  ) {}

  @Post(':code')
  @HttpCode(202)
  async receive(
    @Param('code') code: string,
    @Body() dto: CourierWebhookDto,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-shipflow-signature') signature?: string,
  ) {
    this.couriers.get(code);
    if (config.webhookSecret && !isValidHmacSignature(req.rawBody, signature, config.webhookSecret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const shipment = await this.shipments.findByAwb(dto.awb);
    if (!shipment || shipment.courier !== code) throw new NotFoundError('Shipment with AWB', dto.awb);
    await this.shipments.applyStatus(shipment.tenantId, shipment.id, dto.status, `webhook:${code}`);
    return { accepted: true };
  }

}
