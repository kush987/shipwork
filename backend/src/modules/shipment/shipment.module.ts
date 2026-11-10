import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoShipmentRepository } from './infrastructure/mongo-shipment.repository';
import { ShipmentService } from './application/shipment.service';
import { ShipmentController } from './presentation/shipment.controller';
import { ShipmentBookingService } from './application/shipment-booking.service';
import { ShipmentDispatchService } from './application/shipment-dispatch.service';
import { ShipmentCancellationService } from './application/shipment-cancellation.service';
import { CourierModule } from '../courier/courier.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { ShipmentRepository } from './domain/shipment.repository';

import { ShipmentsDataSource } from './application/shipments.data-source';
import { AwbRouteDoc, AwbRouteSchema } from './infrastructure/awb-route.schema';

@Module({
  imports: [CourierModule, WarehouseModule, MongooseModule.forFeature([{ name: AwbRouteDoc.name, schema: AwbRouteSchema }])],
  controllers: [ShipmentController],
  providers: [
    { provide: ShipmentRepository, useClass: MongoShipmentRepository },
    ShipmentService,
    ShipmentBookingService,
    ShipmentDispatchService,
    ShipmentCancellationService,
    ShipmentsDataSource,
  ],
  exports: [ShipmentService, ShipmentCancellationService, ShipmentsDataSource],
})
export class ShipmentModule {}
