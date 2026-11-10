import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { ExecutionModule } from '../execution/execution.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { EndpointModule } from '../endpoint/endpoint.module';
import { DataModule } from '../data/data.module';
import { StatsController } from './stats.controller';

@Module({
  imports: [WorkflowModule, ExecutionModule, ShipmentModule, EndpointModule, DataModule],
  controllers: [StatsController],
})
export class StatsModule {}
