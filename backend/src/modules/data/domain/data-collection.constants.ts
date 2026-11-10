/** Collection names are stable identifiers that workflows reference, like table names. */
export const COLLECTION_NAME = /^[a-z][a-z0-9_]{1,47}$/;

/**
 * Fields every record has; they are maintained by the store and can't be written or declared.
 * `_id` is the record's id inside MongoDB (shown as `id`).
 */
export const SYSTEM_FIELDS = ['id', '_id', 'createdAt', 'updatedAt'];

/** System fields stored as dates: the only fields a TTL index can expire records by. */
export const DATE_FIELDS = ['createdAt', 'updatedAt'];

/**
 * Each collection is its own MongoDB collection in the workspace's database, named `data.<name>`
 * (e.g. `data.shipments`): the prefix keeps it apart from ShipFlow's own collections there.
 */
export const PHYSICAL_PREFIX = 'data.';

/** Index names users choose (and the API addresses them by). */
export const INDEX_NAME = /^[a-z][a-z0-9_]{0,47}$/;

/** The index every collection has for its default order (newest first). */
export const BUILT_IN_INDEX = 'created_at';

/** A unique field's index is named `unique_<field>`; custom index names may not start with it. */
export const UNIQUE_FIELD_INDEX_PREFIX = 'unique_';

/** Index orders: ascending, descending, or full-text. */
export const INDEX_ORDERS = [1, -1, 'text'] as const;

export const MAX_INDEX_KEYS = 8;

/** Unique fields plus custom indexes; MongoDB allows 64 per collection, a few are kept in reserve. */
export const MAX_INDEXES_PER_COLLECTION = 30;

/** MongoDB stores expireAfterSeconds as a 32-bit integer. */
export const MAX_TTL_SECONDS = 2_147_483_647;

/** Operators MongoDB accepts in an index's partial filter. */
export const PARTIAL_FILTER_OPERATORS = ['$eq', '$gt', '$gte', '$lt', '$lte', '$in', '$exists'];

/** Values a distinct query returns (more are cut off, and the answer says so). */
export const MAX_DISTINCT = 1000;
