import type { EventDefinitionInput } from '../api/types';

export const BLANK_EVENT: EventDefinitionInput = { label: '', description: '', payloadSchema: [] };

/** The part of a custom event key the user types (after "custom."). */
export const CUSTOM_EVENT_PREFIX_RE = /^custom\./;

/** Where the "How to send" curl example posts to. */
export const EMIT_EVENT_URL = 'http://localhost:3000/api/events/emit';
