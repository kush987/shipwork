import { Module } from '@nestjs/common';
import { NodeRegistry } from './node-registry';
import { NodeResolver } from './node-resolver';
import { NODE_TYPES } from './node-types';
import { CustomNodeModule } from '../custom-node/custom-node.module';
import { CourierModule } from '../courier/courier.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { CustomEventModule } from '../custom-event/custom-event.module';
import { DataModule } from '../data/data.module';
import { NodeToolsController } from './presentation/node-tools.controller';
import { BuiltinNodesController } from './presentation/builtin-nodes.controller';
import { BuiltinNodeEditService } from './application/builtin-node-edits.service';
import { BuiltinNodeModule } from '../builtin-node/builtin-node.module';
import { WORKFLOW_NODES } from './domain/workflow-node.constants';
import { providerList } from '../../shared/nest/providers';
import { AppAuthModule } from '../app-auth/app-auth.module';
import { WorkflowCalls } from './domain/workflow-caller';

@Module({
  imports: [CourierModule, ShipmentModule, CustomNodeModule, CustomEventModule, DataModule, AppAuthModule, BuiltinNodeModule],
  controllers: [NodeToolsController, BuiltinNodesController],
  providers: [
    ...providerList(WORKFLOW_NODES, NODE_TYPES),
    NodeRegistry,
    NodeResolver,
    // Bound by the execution module at startup (the engine depends on the steps, so not the other way round).
    WorkflowCalls,
    BuiltinNodeEditService,
  ],
  exports: [NodeRegistry, NodeResolver, WorkflowCalls],
})
export class NodesModule {}
