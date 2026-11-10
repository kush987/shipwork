import { EventPayloadField } from '../domain/event-definition.types';

export interface EventCatalogEntry {
  value: string;
  label: string;
  description?: string;
  custom: boolean;
  payloadSchema?: EventPayloadField[];
}

export interface EmitInput {
  event: string;
  shipmentId?: string;
  orderId?: string;
  payload?: Record<string, unknown>;
}
