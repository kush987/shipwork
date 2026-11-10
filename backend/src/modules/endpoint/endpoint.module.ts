import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowModule } from '../workflow/workflow.module';
import { AppAuthModule } from '../app-auth/app-auth.module';
import { EndpointDoc, EndpointSchema } from './infrastructure/endpoint.schema';
import { MongoEndpointRepository } from './infrastructure/mongo-endpoint.repository';
import { EndpointService } from './application/endpoint.service';
import { EndpointController } from './presentation/endpoint.controller';
import { AuthProvidersController } from './presentation/auth-providers.controller';
import { EndpointRepository } from './domain/api-endpoint.repository';

/** Control plane for API endpoints: method/path/auth/schema, the bound workflow, and app sign-in providers. */
@Module({
  imports: [WorkflowModule, AppAuthModule, MongooseModule.forFeature([{ name: EndpointDoc.name, schema: EndpointSchema }])],
  controllers: [EndpointController, AuthProvidersController],
  providers: [{ provide: EndpointRepository, useClass: MongoEndpointRepository }, EndpointService],
  exports: [EndpointService],
})
export class EndpointModule {}
