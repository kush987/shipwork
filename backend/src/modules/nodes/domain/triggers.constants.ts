/** Trigger key of workflows started by an API endpoint (stored as the workflow's `triggerEvent`). */
export const HTTP_TRIGGER_EVENT = 'http.request';

/** Trigger key of workflows started on a schedule. */
export const SCHEDULE_TRIGGER_EVENT = 'schedule';

/** Headers a workflow must never see: credentials of the caller. */
export const HIDDEN_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'x-api-key']);

/** Trigger keys of workflows started by record changes: `record:<collection>`. */
export const RECORD_TRIGGER_PREFIX = 'record:';

/** What can happen to a record (insert / update or replace / delete in the database). */
export const RECORD_OPERATIONS = ['created', 'updated', 'deleted'] as const;
