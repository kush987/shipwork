import type { IntegrationEnv, IntegrationMode } from './courier-integration.types';

export const INTEGRATION_MODES: readonly IntegrationMode[] = ['simulated', 'sandbox', 'live'];
export const INTEGRATION_ENVS: readonly IntegrationEnv[] = ['sandbox', 'live'];
export const COURIER_CONNECTIONS = ['default', ...INTEGRATION_MODES] as const;

/** What couriers get as the order reference: letters, digits and dashes only (some refuse ":" or "_"), at most 50. */
export const COURIER_REFERENCE_MAX = 50;

/** The setting every courier has: another API host than the default (e.g. the sandbox host in your docs). */
export const BASE_URL_FIELD = 'baseUrl';

/** One call to a courier's real API (sign-in included); simulated couriers keep the gateway's shorter timeout. */
export const REAL_CALL_TIMEOUT_MS = 15_000;
/** The gateway's limit for a whole operation on a real API (a token fetch, then the call). */
export const REAL_OPERATION_TIMEOUT_MS = 30_000;

/** How long a process trusts its cached copy of the settings (other processes may change them). */
export const INTEGRATION_CACHE_MS = 15_000;

/** A pincode every courier serves, for Test connection. */
export const TEST_PINCODE = '110001';

export const SECRET_MASK = '••••';
