export interface EventPayloadField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'boolean';
  required?: boolean;
}

/** A user-defined event. Always concerns one shipment; carries an optional typed payload. */
export interface EventDefinition {
  id: string;
  tenantId: string;
  /** `custom.<slug>` — what workflows trigger on. Fixed at creation. */
  key: string;
  label: string;
  description: string;
  payloadSchema: EventPayloadField[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EventDefinitionInput = Pick<EventDefinition, 'label' | 'description' | 'payloadSchema'>;
