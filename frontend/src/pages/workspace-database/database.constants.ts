import type { DatabaseMode } from '../../api/types';

export const MODE_LABELS: Record<DatabaseMode, string> = {
  managed: 'ShipFlow-managed',
  external: 'Your MongoDB',
};

export const MODE_HELP: Record<DatabaseMode, string> = {
  managed: 'A database ShipFlow created for this workspace and runs for you.',
  external: 'A MongoDB database you own; ShipFlow connects to it with the connection string you gave.',
};

export const SPLIT_EXPLANATION =
  'Business data — shipments, warehouses, courier requests and your data collections — lives in this database. Workflows, endpoints, runs, API keys and accounts stay in ShipFlow.';

export const OWNER_ONLY_NOTE = 'Only owners (or a role with database:manage) can change where business data is stored.';

export const URI_PLACEHOLDER = 'mongodb+srv://user:password@cluster0.example.mongodb.net/acme';

export const URI_HELP = 'A mongodb:// or mongodb+srv:// connection string that ends with the database name. It is stored encrypted and never shown again.';

/** `mongodb[+srv]://<hosts>/<database>` — the database name is the first path segment. */
export const MONGO_URI = /^mongodb(\+srv)?:\/\/[^/\s]+\/([^/?#\s]+)/;
export const MONGO_SCHEME = /^mongodb(\+srv)?:\/\//;

export const HAS_DATA_NOTE =
  'This database already holds data for this workspace, so nothing will be copied — ShipFlow will use what is there.';
