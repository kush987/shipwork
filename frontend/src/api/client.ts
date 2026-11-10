// Public entry point of the API layer. Transport lives in ./http, each resource in ./resources/*.
// `api` stays one flat object so existing `api.listWorkflows()`-style calls keep working.
import { accessApi } from './resources/access';
import { apiKeysApi } from './resources/apiKeys';
import { authApi } from './resources/auth';
import { membersApi } from './resources/members';
import { workspaceDatabaseApi } from './resources/workspaceDatabase';
import { authProvidersApi } from './resources/authProviders';
import { catalogApi } from './resources/catalog';
import { couriersApi } from './resources/couriers';
import { customNodesApi } from './resources/customNodes';
import { builtinNodesApi } from './resources/builtinNodes';
import { dataApi } from './resources/data';
import { endpointsApi } from './resources/endpoints';
import { eventsApi } from './resources/events';
import { executionsApi } from './resources/executions';
import { runtimeApi } from './resources/runtime';
import { shipmentsApi } from './resources/shipments';
import { warehousesApi } from './resources/warehouses';
import { workflowsApi } from './resources/workflows';

export { ApiError } from './http';
export type { RuntimeCall, TestRunInput } from './types';

export const api = {
  ...catalogApi,
  ...workflowsApi,
  ...executionsApi,
  ...shipmentsApi,
  ...customNodesApi,
  ...builtinNodesApi,
  ...eventsApi,
  ...warehousesApi,
  ...couriersApi,
  ...endpointsApi,
  ...apiKeysApi,
  ...dataApi,
  ...runtimeApi,
  ...authApi,
  ...membersApi,
  ...workspaceDatabaseApi,
  ...authProvidersApi,
  ...accessApi,
};
