export const DATA_ROOTS = ['request', 'context', 'trigger', 'shipment'] as const;

export const WORKFLOW_NODES = Symbol('WORKFLOW_NODES');

export const DEFAULT_OUTPUT = [{ id: 'default', label: '' }];

/** Connect it and a failing step continues here (with `context.lastError`) instead of failing the run. */
export const FAILED_OUTPUT = { id: 'failed', label: 'Failed' };

/** Where a routed failure is saved for the next steps: `{{context.lastError.message}}`. */
export const LAST_ERROR_KEY = 'lastError';
