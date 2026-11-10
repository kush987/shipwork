import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { config } from './config/configuration';
import { EventsModule } from './shared/events/events.module';
import { OutboundHttpModule } from './shared/http/outbound-http.module';
import { CourierModule } from './modules/courier/courier.module';
import { ShipmentModule } from './modules/shipment/shipment.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { TriggerModule } from './modules/trigger/trigger.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { StatsModule } from './modules/stats/stats.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { CustomNodeModule } from './modules/custom-node/custom-node.module';
import { CustomEventModule } from './modules/custom-event/custom-event.module';
import { DataModule } from './modules/data/data.module';
import { EndpointModule } from './modules/endpoint/endpoint.module';
import { ApiKeyModule } from './modules/api-key/api-key.module';
import { RuntimeModule } from './modules/runtime/runtime.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './shared/redis/redis.module';
import { RateLimitModule } from './shared/rate-limit/rate-limit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { WorkspaceDbModule } from './modules/workspace-db/workspace-db.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    MongooseModule.forRoot(config.mongoUri),
    BullModule.forRoot({ connection: config.redis }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    EventsModule,
    RedisModule,
    RateLimitModule,
    AuditModule,
    IdentityModule,
    WorkspaceDbModule,
    OutboundHttpModule,
    CourierModule,
    WarehouseModule,
    CustomNodeModule,
    CustomEventModule,
    DataModule,
    ShipmentModule,
    NodesModule,
    WorkflowModule,
    ExecutionModule,
    TriggerModule,
    WebhookModule,
    // Backend as a service: endpoints + keys (control plane) and the runtime gateway (data plane)
    EndpointModule,
    ApiKeyModule,
    RuntimeModule,
    StatsModule,
    HealthModule,
  ],
})
export class AppModule {}
