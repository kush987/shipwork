import type { SystemSourceInfo } from '../../data/domain/data-source.types';

export const WAREHOUSES_SOURCE: SystemSourceInfo = {
  name: 'system.warehouses',
  label: 'Warehouses',
  description: 'Your pickup and return (RTO) locations, with contact and address.',
  defaultSort: [{ field: 'name', direction: 1 }],
  fields: [
    { key: 'id', type: 'string', description: 'Warehouse id' },
    { key: 'name', type: 'string', description: 'Warehouse name' },
    { key: 'contactName', type: 'string', description: 'Contact person' },
    { key: 'phone', type: 'string', description: 'Contact phone' },
    { key: 'address.city', type: 'string', description: 'City' },
    { key: 'address.state', type: 'string', description: 'State' },
    { key: 'address.pincode', type: 'string', description: 'Pincode' },
    { key: 'isDefault', type: 'boolean', description: 'Pre-selected on new shipments' },
    { key: 'active', type: 'boolean', description: 'Can be used for new shipments' },
    { key: 'createdAt', type: 'string', description: 'When it was added (ISO date)' },
  ],
};
