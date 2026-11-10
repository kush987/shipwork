/** How deep workflows may run each other (A runs B runs C…) before a call is refused as a likely loop. */
export const MAX_CALL_DEPTH = 5;

/** How long a Run workflow step waits for an answer, in seconds. */
export const CALL_TIMEOUT_SECONDS = { default: 10, min: 1, max: 30 } as const;

/** The request a called workflow sees when the step builds it: a POST to its own root. */
export const CALLED_REQUEST = { method: 'POST', path: '/' } as const;

/** Status saved for a called workflow that finished without a Return response. */
export const NO_RESPONSE_STATUS = 204;

export const RUN_MODES = ['wait', 'background'] as const;

export const REQUEST_MODES = ['build', 'forward'] as const;
