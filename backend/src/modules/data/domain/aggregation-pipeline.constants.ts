/** Pipeline stages an aggregation may use: reading and reshaping only. */
export const ALLOWED_STAGES = [
  '$match',
  '$project',
  '$addFields',
  '$set',
  '$unset',
  '$group',
  '$sort',
  '$limit',
  '$skip',
  '$unwind',
  '$count',
  '$facet',
  '$bucket',
  '$bucketAuto',
  '$sortByCount',
  '$lookup',
  '$graphLookup',
  '$unionWith',
  '$replaceRoot',
  '$replaceWith',
  '$sample',
  '$setWindowFields',
  '$densify',
  '$fill',
  '$redact',
];

/** Operators that write, run code or read server internals — refused anywhere in a pipeline. */
export const FORBIDDEN_OPERATORS = [
  '$out',
  '$merge',
  '$function',
  '$accumulator',
  '$where',
  '$collStats',
  '$indexStats',
  '$currentOp',
  '$listSessions',
  '$listLocalSessions',
  '$planCacheStats',
  '$documents',
  '$changeStream',
];

export const MAX_STAGES = 30;
/** Results an aggregation returns (more are cut off, and the answer says so). */
export const MAX_AGGREGATE_RESULTS = 1000;
export const AGGREGATE_TIMEOUT_MS = 10_000;
