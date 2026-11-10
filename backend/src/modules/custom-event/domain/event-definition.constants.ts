export const CUSTOM_EVENT_PREFIX = 'custom.';

/** Workflows may emit events that trigger other workflows; this bounds accidental loops. */
export const MAX_EVENT_CHAIN_DEPTH = 5;
