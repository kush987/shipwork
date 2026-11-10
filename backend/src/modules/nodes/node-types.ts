import type { Type } from '@nestjs/common';
import { TriggerEventNode } from './implementations/trigger/trigger-event.node';
import { TriggerHttpNode } from './implementations/trigger/trigger-http.node';
import { TriggerScheduleNode } from './implementations/trigger/trigger-schedule.node';
import { TriggerRecordNode } from './implementations/trigger/trigger-record.node';
import { ConditionNode } from './implementations/logic/condition.node';
import { DataQueryNode } from './implementations/data/data-query.node';
import { DataPaginateNode } from './implementations/data/data-paginate.node';
import { DataGetNode } from './implementations/data/data-get.node';
import { DataInsertNode } from './implementations/data/data-insert.node';
import { DataUpdateNode } from './implementations/data/data-update.node';
import { DataDeleteNode } from './implementations/data/data-delete.node';
import { DataAggregateNode, DataDeleteManyNode, DataDistinctNode, DataUpdateManyNode } from './implementations/data/data-many.nodes';
import { DataTransactionNode } from './implementations/data/data-transaction.node';
import { SetDataNode } from './implementations/transform/set-data.node';
import { RunCodeNode } from './implementations/transform/run-code.node';
import { HttpResponseNode } from './implementations/response/http-response.node';
import { DelayNode } from './implementations/flow/delay.node';
import { EmitEventNode } from './implementations/flow/emit-event.node';
import { RunWorkflowNode } from './implementations/flow/run-workflow.node';
import { NotifyNode } from './implementations/integration/notify.node';
import { FetchDataNode } from './implementations/integration/fetch-data.node';
import { HttpRequestNode } from './implementations/integration/http-request.node';
import { CourierServiceabilityNode } from './implementations/logistics/courier-serviceability.node';
import { CourierRatesNode } from './implementations/logistics/courier-rates.node';
import { CourierApiNode } from './implementations/logistics/courier-api.node';
import { CourierSelectNode } from './implementations/logistics/courier-select.node';
import { ShipmentCreateNode } from './implementations/logistics/shipment-create.node';
import { ShipmentCancelNode } from './implementations/logistics/shipment-cancel.node';
import { ShipmentTagNode } from './implementations/logistics/shipment-tag.node';
import { ShipmentUseNode } from './implementations/logistics/shipment-use.node';
import type { WorkflowNode } from './domain/workflow-node.types';
import { AuthorizeNode } from './implementations/access/authorize.node';
import { AccessDecisionNode } from './implementations/access/access-decision.node';
import { HashPasswordNode, VerifyPasswordNode } from './implementations/access/password.nodes';
import { IssueTokenNode } from './implementations/access/issue-token.node';

/**
 * Every built-in node type. Adding a node = writing one class and listing it here (Open/Closed):
 * the engine, validator, catalog and builder pick it up without other changes.
 * Order is the order shown in the builder palette.
 */
export const NODE_TYPES: Type<WorkflowNode>[] = [
  // triggers
  TriggerEventNode,
  TriggerHttpNode,
  TriggerScheduleNode,
  TriggerRecordNode,
  // logic
  ConditionNode,
  // access (IAM for the apps workspaces build)
  AuthorizeNode,
  AccessDecisionNode,
  HashPasswordNode,
  VerifyPasswordNode,
  IssueTokenNode,
  // data
  DataQueryNode,
  DataPaginateNode,
  DataGetNode,
  DataInsertNode,
  DataUpdateNode,
  DataDeleteNode,
  DataUpdateManyNode,
  DataDeleteManyNode,
  DataAggregateNode,
  DataDistinctNode,
  DataTransactionNode,
  // transform & code
  SetDataNode,
  RunCodeNode,
  // response
  HttpResponseNode,
  // flow
  DelayNode,
  EmitEventNode,
  RunWorkflowNode,
  // integrations
  NotifyNode,
  FetchDataNode,
  HttpRequestNode,
  // logistics
  ShipmentUseNode,
  CourierServiceabilityNode,
  CourierRatesNode,
  CourierApiNode,
  CourierSelectNode,
  ShipmentCreateNode,
  ShipmentCancelNode,
  ShipmentTagNode,
];
