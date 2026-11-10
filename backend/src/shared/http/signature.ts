import { createHmac, timingSafeEqual } from 'crypto';

/** Constant-time check of an HMAC-SHA256 hex signature over the raw request body. */
export function isValidHmacSignature(rawBody: Buffer | string | undefined, signature: string | undefined, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody ?? '').digest('hex');
  return !!signature && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
