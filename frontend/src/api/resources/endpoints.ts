import { request } from '../http';
import type { ApiEndpoint, EndpointInput, EndpointUpdateInput } from '../types';

export const endpointsApi = {
  listEndpoints: () => request<ApiEndpoint[]>('GET', '/endpoints'),
  getEndpoint: (id: string) => request<ApiEndpoint>('GET', `/endpoints/${id}`),
  /** Without `workflowId` the backend creates and binds a new workflow named after the endpoint. */
  createEndpoint: (body: EndpointInput) => request<ApiEndpoint>('POST', '/endpoints', body),
  /** `workflowId` is required on update. */
  updateEndpoint: (id: string, body: EndpointUpdateInput) => request<ApiEndpoint>('PUT', `/endpoints/${id}`, body),
  deleteEndpoint: (id: string) => request<void>('DELETE', `/endpoints/${id}`),
  /** OpenAPI 3.0 document of every enabled endpoint. */
  openApiSpec: () => request<Record<string, unknown>>('GET', '/endpoints/openapi.json'),
};
