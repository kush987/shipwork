import type { CollectionDraft, SortKey } from './data.types';

/** System fields every record has; they can't be written. */
export const SYSTEM_FIELDS = ['id', 'createdAt', 'updatedAt'] as const;

export const COLLECTION_NAME_RE = /^[a-z][a-z0-9_]{1,47}$/;

/** Columns shown in the records table before the rest are summarized as "N more fields". */
export const MAX_COLUMNS = 8;

/** Longest cell text before it is cut with "…". */
export const CELL_TEXT_MAX = 60;

export const RECORDS_PAGE_SIZE = 50;

export const RECORD_SORTS: Record<SortKey, { label: string; value: string }> = {
  newest: { label: 'Newest first', value: '{"createdAt":-1}' },
  oldest: { label: 'Oldest first', value: '{"createdAt":1}' },
};

export const BLANK_COLLECTION: CollectionDraft = { name: '', label: '', description: '', fields: [] };

/** Table columns of the built-in sources (dotted paths read nested values). Others show their first fields. */
export const BUILTIN_COLUMNS: Record<string, string[]> = {
  'system.shipments': ['orderId', 'status', 'courier', 'awb', 'paymentMode', 'orderValue'],
  'system.warehouses': ['name', 'address.city', 'address.pincode', 'isDefault', 'active'],
  'system.couriers': ['code', 'name', 'enabled', 'circuit', 'avgDeliveryDays'],
};

/** Filter placeholders for the built-in sources. */
export const BUILTIN_FILTER_EXAMPLES: Record<string, string> = {
  'system.shipments': '{"status": "new", "paymentMode": "COD"}',
  'system.warehouses': '{"active": true}',
  'system.couriers': '{"enabled": true}',
};

export const COLLECTION_FILTER_EXAMPLE = '{"price": {"$gte": 100}}';

/** Extra advice shown on a built-in source, beyond "read it with Get / Find records". */
export const BUILTIN_TIPS: Record<string, string> = {
  'system.shipments':
    'To act on a shipment in an API or scheduled workflow (rates, book, cancel, tag, notify), add a “Use shipment” step first — then {{shipment.*}} is available.',
  'system.couriers': 'Read courier status here; the courier steps (Get courier rates, Select courier) quote and book them.',
};

/** Index names, as the API checks them. */
export const INDEX_NAME_RE = /^[a-z][a-z0-9_]{0,47}$/;

/** How an index orders a field. */
export const INDEX_ORDER_OPTIONS = [
  { value: '1', label: 'Ascending ↑' },
  { value: '-1', label: 'Descending ↓' },
  { value: 'text', label: 'Text search' },
] as const;

/** The only date fields records have: a TTL index expires records by one of them. */
export const DATE_FIELDS = ['createdAt', 'updatedAt'];

/** Where an index comes from, as a badge. */
export const INDEX_ORIGINS: Record<string, { label: string; tone: 'neutral' | 'info' | 'accent' | 'warning' }> = {
  'built-in': { label: 'built-in', tone: 'neutral' },
  'unique-field': { label: 'unique field', tone: 'info' },
  custom: { label: 'custom', tone: 'accent' },
  external: { label: 'made outside ShipFlow', tone: 'warning' },
};

export const BLANK_INDEX_KEY = { field: '', order: '1' as const };
