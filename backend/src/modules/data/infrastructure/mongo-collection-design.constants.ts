/** How each field type is stored, for the MongoDB validator (`number` covers int, long, double, decimal). */
export const BSON_TYPES = {
  string: 'string',
  number: 'number',
  boolean: 'bool',
  object: 'object',
  array: 'array',
  date: 'date',
} as const;

/**
 * The database checks every insert, and every update of a record that met the schema. Records
 * stored before a field became required are left alone until someone fixes them.
 */
export const VALIDATION = { validationLevel: 'moderate', validationAction: 'error' } as const;

/** Where every collection's records lived before each collection got its own (migrated away). */
export const LEGACY_RECORDS = 'data_records';
/** The names the old layout gave its unique indexes: `uniq:<workspace>:<collection>:<field>`. */
export const LEGACY_UNIQUE_PREFIX = 'uniq:';

/** MongoDB error codes this adapter turns into clear messages. */
export const MONGO_ERROR = {
  illegalOperation: 20,
  namespaceNotFound: 26,
  indexNotFound: 27,
  namespaceExists: 48,
  indexOptionsConflict: 85,
  indexKeySpecsConflict: 86,
  maxTimeExpired: 50,
  documentValidationFailure: 121,
  changeStreamFatal: 280,
  changeStreamHistoryLost: 286,
  duplicateKey: 11000,
} as const;

export const MIGRATION_BATCH_SIZE = 500;
/** One process migrates a workspace's records at a time; the lock expires if it dies midway. */
export const MIGRATION_LOCK_MS = 5 * 60_000;
export const MIGRATION_WAIT_POLL_MS = 250;
