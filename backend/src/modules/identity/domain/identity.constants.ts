/** Built-in roles, from least to most access. */
export const ROLES = ['viewer', 'editor', 'owner'] as const;

export const SESSION_PREFIX = 'sfs_';
export const SESSION_TTL_MS = 7 * 24 * 3_600_000;
/** `lastUsedAt` is refreshed at most this often, so reads don't turn into writes. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign-in attempts allowed per minute, per email and per client address. */
export const LOGIN_ATTEMPTS_PER_EMAIL = 10;
export const LOGIN_ATTEMPTS_PER_IP = 30;
