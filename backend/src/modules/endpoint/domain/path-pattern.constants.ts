/**
 * Endpoint paths like `/orders/:id/items`. Pure functions shared by validation (control plane),
 * routing (runtime) and OpenAPI generation, so all three agree on what a path means.
 */
export const STATIC_SEGMENT = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export const PARAM_SEGMENT = /^:[A-Za-z_][A-Za-z0-9_]{0,39}$/;

export const MAX_SEGMENTS = 8;
