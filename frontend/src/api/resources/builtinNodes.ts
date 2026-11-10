import { request } from '../http';
import type { BuiltinNodeDetail, BuiltinNodeEditInput, BuiltinNodeView } from '../types';

/** The workspace's changes to built-in steps. There is no delete — reset undoes the changes. */
export const builtinNodesApi = {
  listBuiltinNodes: () => request<BuiltinNodeView[]>('GET', '/builtin-nodes'),
  getBuiltinNode: (type: string) => request<BuiltinNodeDetail>('GET', `/builtin-nodes/${encodeURIComponent(type)}`),
  saveBuiltinNode: (type: string, body: BuiltinNodeEditInput) => request<BuiltinNodeDetail>('PUT', `/builtin-nodes/${encodeURIComponent(type)}`, body),
  resetBuiltinNode: (type: string) => request<BuiltinNodeDetail>('POST', `/builtin-nodes/${encodeURIComponent(type)}/reset`),
};
