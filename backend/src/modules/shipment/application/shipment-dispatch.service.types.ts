import { Shipment } from '../domain/shipment.types';

export interface TriggerResult {
  id: string;
  orderId: string | null;
  ok: boolean;
  status?: Shipment['status'];
  courier?: string | null;
  awb?: string | null;
  error?: string;
}
