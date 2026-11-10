import { createHash, randomBytes } from 'crypto';

/** A long random credential with a recognisable prefix (API keys `sk_`, sessions `sfs_`). */
export const generateSecret = (prefix: string, bytes = 24) => `${prefix}${randomBytes(bytes).toString('base64url')}`;

/** Secrets are long and random, so a fast hash is enough (no password-style stretching needed). */
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
