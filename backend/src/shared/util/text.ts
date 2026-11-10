import { deburr, trim } from 'lodash';

export interface SlugOptions {
  separator?: '_' | '-';
  maxLength?: number;
}

/** `"Payment Failed!"` → `payment_failed`: lowercase letters and digits joined by one separator. */
export function slugify(text: string, { separator = '_', maxLength = 48 }: SlugOptions = {}): string {
  const slug = deburr(text).toLowerCase().replace(/[^a-z0-9]+/g, separator);
  return trim(slug, separator).slice(0, maxLength);
}
