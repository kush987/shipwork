import { request } from '../http';
import { qs, seg } from '../http.helpers';
import type { AccessCatalog, AccessMe, AuditPage, AuditQuery, Role, RoleInput, SimulateInput, SimulateResult } from '../types';

const role = (id: string) => `/roles/${seg(id)}`;

export const accessApi = {
  getAccessCatalog: () => request<AccessCatalog>('GET', '/access/catalog'),
  getMyAccess: () => request<AccessMe>('GET', '/access/me'),
  simulateAccess: (input: SimulateInput) => request<SimulateResult>('POST', '/access/simulate', input),
  listRoles: () => request<Role[]>('GET', '/roles'),
  createRole: (input: RoleInput) => request<Role>('POST', '/roles', input),
  updateRole: (id: string, input: RoleInput) => request<Role>('PUT', role(id), input),
  deleteRole: (id: string) => request<void>('DELETE', role(id)),
  listAudit: (q: AuditQuery = {}) => request<AuditPage>('GET', `/audit${qs({ limit: 50, ...q })}`),
};
