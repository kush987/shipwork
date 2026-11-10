import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourierRegistry } from './application/courier-registry';
import { CourierGateway } from './application/courier-gateway';
import { CourierIntegrationService } from './application/courier-integration.service';
import { IntegratedCourierProvider } from './application/integrated-courier.provider';
import { CourierController } from './presentation/courier.controller';
import { SimulatedCourierProvider } from './infrastructure/providers/simulated-courier.provider';
import { COURIER_PROVIDERS } from './domain/courier-provider.constants';
import { COURIER_PROFILES } from './infrastructure/providers/courier-profiles.constants';
import { CourierIntegrationDoc, CourierIntegrationSchema } from './infrastructure/persistence/courier-integration.schema';
import { RealCourierFactory } from './infrastructure/integrations/real-courier.factory';
import { CouriersDataSource } from './infrastructure/couriers.data-source';

@Module({
  imports: [MongooseModule.forFeature([{ name: CourierIntegrationDoc.name, schema: CourierIntegrationSchema }])],
  controllers: [CourierController],
  providers: [
    RealCourierFactory,
    CourierIntegrationService,
    {
      provide: COURIER_PROVIDERS,
      // Each courier runs on its simulation until its real API is set up on the Couriers page.
      useFactory: (integrations: CourierIntegrationService, real: RealCourierFactory) =>
        COURIER_PROFILES.map((p) => new IntegratedCourierProvider(new SimulatedCourierProvider(structuredClone(p)), integrations, real)),
      inject: [CourierIntegrationService, RealCourierFactory],
    },
    CourierRegistry,
    CourierGateway,
    CouriersDataSource,
  ],
  exports: [CourierRegistry, CourierGateway, CouriersDataSource, CourierIntegrationService],
})
export class CourierModule {}
