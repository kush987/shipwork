/** Managed workspace databases are named `sfb_<workspace>` ("ShipFlow business"). */
export const MANAGED_DB_PREFIX = 'sfb_';

/** MongoDB limits database names to 63 bytes; longer workspace ids are shortened with a hash. */
export const MAX_DB_NAME_LENGTH = 63;

/** Names a workspace may not use for its own database. */
export const RESERVED_DB_NAMES = ['admin', 'local', 'config'];

/**
 * ShipFlow's business collections in a workspace's database, each document tagged with its
 * workspace (everything else is platform data). Order matters for copying: nothing references
 * later entries. `data_records` holds records from before each data collection got its own.
 */
export const BUSINESS_COLLECTIONS = [
  { name: 'warehouses', label: 'Warehouses' },
  { name: 'shipments', label: 'Shipments' },
  { name: 'courier_requests', label: 'Courier requests' },
  { name: 'data_collections', label: 'Data collections' },
  { name: 'data_records', label: 'Data records' },
] as const;

/** The workspace's own data collections are named `data.<name>` (see the data module). */
export const DATA_COLLECTION_PREFIX = 'data.';
