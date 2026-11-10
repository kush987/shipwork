export const SHIPMENT_EVENTS = [
  { value: 'shipment.created', label: 'Shipment created' },
  { value: 'shipment.updated', label: 'Shipment details edited' },
  { value: 'shipment.assigned', label: 'Courier assigned' },
  { value: 'shipment.picked_up', label: 'Picked up' },
  { value: 'shipment.in_transit', label: 'In transit' },
  { value: 'shipment.out_for_delivery', label: 'Out for delivery' },
  { value: 'shipment.delivered', label: 'Delivered' },
  { value: 'shipment.ndr', label: 'NDR raised' },
  { value: 'shipment.rto_initiated', label: 'RTO initiated' },
  { value: 'shipment.rto_delivered', label: 'RTO delivered' },
  { value: 'shipment.cancelled', label: 'Shipment cancelled' },
] as const;

/** Durable queue of the events that can start workflows; queue workers turn them into runs. */
export const DOMAIN_EVENTS_QUEUE = 'domain-events';

/** Events with these prefixes can start workflows (trigger nodes); others are internal notifications. */
export const WORKFLOW_EVENT_PREFIXES = ['shipment.', 'custom.'];

export const EVENT_JOB_ATTEMPTS = 5;
