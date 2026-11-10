import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { PASSWORD_HASH_PREFIX, SCRYPT } from './passwords.constants';

const scrypt = (password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }) =>
  new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key))));

/** `scrypt$N$r$p$<salt>$<hash>` — the parameters travel with the hash, so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keyLength, maxmem } = SCRYPT;
  const key = await scrypt(password, salt, keyLength, { N, r, p, maxmem });
  return [PASSWORD_HASH_PREFIX, N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Constant-time check; false for anything malformed. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, N, r, p, salt, hash] = stored.split('$');
  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
