import { directMapping } from '../../../shared/query/mongo-record-query';

/** Shipments are stored as-is (`id` is `_id`); these fields are Dates in Mongo. */
export const SHIPMENT_FIELD_MAPPING = directMapping(['createdAt', 'updatedAt', 'triggeredAt']);

// `{ $type: 'null' }` matches an explicit null only. Shipments created before triggers existed
// have no field at all and count as already triggered.
export const AWAITING_TRIGGER = { status: 'new', triggeredAt: { $type: 'null' } };
