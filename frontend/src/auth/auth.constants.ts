import type { AuthState } from './auth.types';

/** localStorage keys. */
export const SESSION_KEY = 'shipflow.session';
export const TENANT_KEY = 'shipflow.tenant';

export const SIGNED_OUT: AuthState = { token: null, expiresAt: null, user: null, memberships: [], activeTenantId: null, validated: false };

/** Same rule as the server; checked as the user types. */
export const PASSWORD_MIN_LENGTH = 10;

/** The built-in role every workspace keeps at least one member in. */
export const OWNER_ROLE = 'owner';

/** Built-in role ids; every other role id is a custom role (`role_…`). */
export const BUILT_IN_ROLE_IDS: readonly string[] = [OWNER_ROLE, 'editor', 'viewer'];

/** The verb of a read action (`workflows:read`); every other verb changes something. */
export const READ_VERB = 'read';

/** Pages reachable without a session. */
export const LOGIN_PATH = '/login';
export const SIGNUP_PATH = '/signup';
