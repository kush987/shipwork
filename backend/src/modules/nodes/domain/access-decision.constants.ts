/**
 * An "Access decision" step answers with a response carrying this header; the runtime gateway
 * reads it when the workflow runs as an endpoint's authorizer.
 */
export const ACCESS_DECISION_HEADER = 'x-shipflow-decision';
