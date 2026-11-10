import { Module } from '@nestjs/common';
import { EndpointModule } from '../endpoint/endpoint.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import { ExecutionModule } from '../execution/execution.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { EndpointRouter } from './application/endpoint-router';
import { ApiKeyAuthenticator, JwtAuthenticator, PublicAuthenticator } from './application/endpoint-authenticators';
import { AsyncInvoker, SyncInvoker } from './application/endpoint-invokers';
import { RuntimeGateway } from './application/runtime-gateway';
import { RuntimeController } from './presentation/runtime.controller';
import { ENDPOINT_AUTHENTICATORS } from './application/endpoint-authenticators.constants';
import { ENDPOINT_INVOKERS } from './application/endpoint-invokers.constants';
import { providerList } from '../../shared/nest/providers';
import { EndpointThrottle } from './application/endpoint-throttle';
import { GATEWAY_LIMITS } from './application/gateway-limits.constants';
import { config } from '../../config/configuration';
import { EndpointAuthorizer } from './application/endpoint-authorizer';
import { AppAuthModule } from '../app-auth/app-auth.module';

/** Data plane: serves calls to the endpoints tenants defined, by running their workflows. */
@Module({
  imports: [EndpointModule, ApiKeyModule, ExecutionModule, WorkflowModule, AppAuthModule],
  controllers: [RuntimeController],
  providers: [
    EndpointRouter,
    ...providerList(ENDPOINT_AUTHENTICATORS, [PublicAuthenticator, ApiKeyAuthenticator, JwtAuthenticator]),
    EndpointAuthorizer,
    ...providerList(ENDPOINT_INVOKERS, [SyncInvoker, AsyncInvoker]),
    RuntimeGateway,
    EndpointThrottle,
    { provide: GATEWAY_LIMITS, useValue: config.rateLimits },
  ],
})
export class RuntimeModule {}
