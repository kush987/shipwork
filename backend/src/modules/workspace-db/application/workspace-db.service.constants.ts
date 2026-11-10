export const MANAGED_HOST_LABEL = 'ShipFlow-managed';
export const PING_TIMEOUT_MS = 5_000;

/**
 * Each workspace's collections are stored as they are (`data.<name>`), so a database belongs to
 * one workspace: two sharing it would share collections.
 */
export const OWNED_BY_ANOTHER = 'This database already holds another workspace’s data — each workspace needs a database of its own';
