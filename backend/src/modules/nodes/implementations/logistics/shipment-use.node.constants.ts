/** How "Use shipment" looks the shipment up. */
export const SHIPMENT_LOOKUPS = [
  { value: 'id', label: 'Shipment id' },
  { value: 'orderId', label: 'Order id (latest shipment)' },
  { value: 'awb', label: 'AWB (tracking number)' },
] as const;
