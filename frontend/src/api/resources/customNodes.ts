import { request } from '../http';
import { qs } from '../http.helpers';
import type {
  CustomNode,
  CustomNodeDetail,
  CustomNodeSpec,
  CustomNodeTemplate,
  CustomNodeTestRequest,
  CustomNodeTestResult,
  CustomNodeVersion,
} from '../types';

export const customNodesApi = {
  listCustomNodes: (includeArchived = false) =>
    request<CustomNode[]>('GET', `/custom-nodes${qs({ includeArchived: includeArchived ? 'true' : undefined })}`),
  customNodeTemplates: () => request<CustomNodeTemplate[]>('GET', '/custom-nodes/templates'),
  getCustomNode: (id: string) => request<CustomNodeDetail>('GET', `/custom-nodes/${id}`),
  getCustomNodeVersion: (id: string, version: number) => request<CustomNodeVersion>('GET', `/custom-nodes/${id}/versions/${version}`),
  createCustomNode: (spec: CustomNodeSpec) => request<CustomNode>('POST', '/custom-nodes', spec),
  updateCustomNode: (id: string, spec: CustomNodeSpec) => request<CustomNode>('PUT', `/custom-nodes/${id}`, spec),
  testCustomNode: (body: CustomNodeTestRequest) => request<CustomNodeTestResult>('POST', '/custom-nodes/test', body),
  archiveCustomNode: (id: string) => request<CustomNode>('POST', `/custom-nodes/${id}/archive`),
  restoreCustomNode: (id: string) => request<CustomNode>('POST', `/custom-nodes/${id}/restore`),
};
