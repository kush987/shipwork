import { randomBytes } from 'crypto';

/** Sortable-ish, prefixed ids, e.g. `wf_m2x9k1_3f9a2c7b`. Prefixes make logs self-describing. */
export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString('hex')}`;
