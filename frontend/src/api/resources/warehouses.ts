import { request } from '../http';
import { qs } from '../http.helpers';
import type { Warehouse, WarehouseInput } from '../types';

export const warehousesApi = {
  listWarehouses: (includeInactive = false) =>
    request<Warehouse[]>('GET', `/warehouses${qs({ includeInactive: includeInactive ? 'true' : undefined })}`),
  createWarehouse: (body: WarehouseInput) => request<Warehouse>('POST', '/warehouses', body),
  updateWarehouse: (id: string, body: Partial<WarehouseInput>) => request<Warehouse>('PATCH', `/warehouses/${id}`, body),
  deactivateWarehouse: (id: string) => request<Warehouse>('DELETE', `/warehouses/${id}`),
  reactivateWarehouse: (id: string) => request<Warehouse>('POST', `/warehouses/${id}/reactivate`),
};
