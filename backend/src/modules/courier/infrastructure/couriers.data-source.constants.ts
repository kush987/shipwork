import type { SystemSourceInfo } from '../../data/domain/data-source.types';

export const COURIERS_SOURCE: SystemSourceInfo = {
  name: 'system.couriers',
  label: 'Couriers',
  description: 'Courier partners with their status, health (circuit) and rate card.',
  defaultSort: [{ field: 'name', direction: 1 }],
  fields: [
    { key: 'id', type: 'string', description: 'Courier code, e.g. delhivery' },
    { key: 'code', type: 'string', description: 'Courier code' },
    { key: 'name', type: 'string', description: 'Display name' },
    { key: 'enabled', type: 'boolean', description: 'Used for rates and bookings' },
    { key: 'circuit', type: 'string', description: 'closed (healthy) · open (failing, skipped) · half_open (probing)' },
    { key: 'avgDeliveryDays', type: 'number', description: 'Typical delivery time in days' },
    { key: 'baseRate', type: 'number', description: 'Base charge per parcel' },
    { key: 'perKgRate', type: 'number', description: 'Charge per kg' },
    { key: 'codFeePct', type: 'number', description: 'COD fee in % of the COD amount' },
  ],
};
