import { Module } from '@nestjs/common';
import { ShipmentModule } from '../shipment/shipment.module';
import { CourierModule } from '../courier/courier.module';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [ShipmentModule, CourierModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
