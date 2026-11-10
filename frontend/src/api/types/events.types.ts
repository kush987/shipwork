// Event catalog, custom event definitions and emitting events (docs/API_CONTRACT.md).

export interface EventPayloadField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'boolean';
  required?: boolean;
}

export interface EventOption {
  value: string;
  label: string;
  description?: string;
  /** User-defined event (key starts with `custom.`). */
  custom?: boolean;
  payloadSchema?: EventPayloadField[];
}

export interface EventDefinition {
  id: string;
  key: string;
  label: string;
  description: string;
  payloadSchema: EventPayloadField[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EventDefinitionInput = Pick<EventDefinition, 'label' | 'description' | 'payloadSchema'> & { slug?: string };

/** Body of POST /events/emit. */
export interface EmitEventInput {
  event: string;
  shipmentId?: string;
  orderId?: string;
  payload?: Record<string, unknown>;
}

export interface EmitResult {
  event: string;
  label: string;
  shipmentId: string;
  orderId: string;
  payload: Record<string, unknown>;
  emittedAt: string;
}
