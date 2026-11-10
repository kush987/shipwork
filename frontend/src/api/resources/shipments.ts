import { request } from '../http';
import { qs } from '../http.helpers';
import type {
  BulkCourierOption,
  BulkTriggerResult,
  CourierOption,
  Dispatch,
  FetchTestResult,
  RunWorkflowsResult,
  Shipment,
  ShipmentInput,
  ShipmentListParams,
  ShipmentQuoteInput,
} from '../types';

export const shipmentsApi = {
  listShipments: (p: ShipmentListParams = {}) =>
    request<Shipment[]>('GET', `/shipments${qs({ limit: 100, awaitingTrigger: p.awaitingTrigger ? 'true' : undefined })}`),
  createShipment: (body: ShipmentInput, dispatch: Dispatch = { mode: 'auto', courier: null }) =>
    request<Shipment>('POST', '/shipments', { ...body, dispatch }),
  quoteShipment: (body: ShipmentQuoteInput) => request<CourierOption[]>('POST', '/shipments/quote', body),
  runWorkflowsForShipment: (id: string, workflowIds: string[]) =>
    request<RunWorkflowsResult>('POST', `/shipments/${id}/run-workflows`, { workflowIds }),
  cancelShipment: (id: string, reason: string) => request<Shipment>('POST', `/shipments/${id}/cancel`, { reason }),
  triggerShipment: (id: string) => request<Shipment>('POST', `/shipments/${id}/trigger`),
  bulkTrigger: (ids: string[], courier?: string) => request<BulkTriggerResult>('POST', '/shipments/trigger', { ids, courier }),
  bulkCourierOptions: (ids: string[]) => request<BulkCourierOption[]>('POST', '/shipments/bulk-courier-options', { ids }),
  selectCourier: (id: string, courier: string) => request<Shipment>('PUT', `/shipments/${id}/selected-courier`, { courier }),
  getShipment: (id: string) => request<Shipment>('GET', `/shipments/${id}`),
  updateShipment: (id: string, body: Partial<ShipmentInput>) => request<Shipment>('PATCH', `/shipments/${id}`, body),
  courierOptions: (id: string) => request<CourierOption[]>('GET', `/shipments/${id}/courier-options`),
  assignCourier: (id: string, courier: string) => request<Shipment>('POST', `/shipments/${id}/assign`, { courier }),
  shipmentEvent: (id: string, status: string) => request<Shipment>('POST', `/shipments/${id}/events`, { status }),

  /** Fetch data node tester (placeholders are filled from a shipment). */
  testFetchData: (config: Record<string, unknown>, shipmentId?: string) =>
    request<FetchTestResult>('POST', '/nodes/fetch-data/test', { config, shipmentId }),
};
