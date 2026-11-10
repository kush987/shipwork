import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShipmentModule } from '../shipment/shipment.module';
import { EventDefinitionDoc, EventDefinitionSchema } from './infrastructure/event-definition.schema';
import { MongoEventDefinitionRepository } from './infrastructure/mongo-event-definition.repository';
import { EventDefinitionService } from './application/event-definition.service';
import { EventController } from './presentation/event.controller';
import { EventDefinitionRepository } from './domain/event-definition.repository';

@Module({
  imports: [ShipmentModule, MongooseModule.forFeature([{ name: EventDefinitionDoc.name, schema: EventDefinitionSchema }])],
  controllers: [EventController],
  providers: [{ provide: EventDefinitionRepository, useClass: MongoEventDefinitionRepository }, EventDefinitionService],
  exports: [EventDefinitionService],
})
export class CustomEventModule {}
