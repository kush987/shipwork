import { Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from '../../config/configuration';
import { ENCRYPTION_VERSION, IV_BYTES } from './encryption.constants';

let devKeyWarned = false;

/**
 * The key for secrets at rest (e.g. database connection strings). Production must set
 * DATA_ENCRYPTION_KEY; elsewhere a fixed development key is used, with a warning.
 */
export function encryptionKey(): Buffer {
  if (config.dataEncryptionKey) {
    const key = Buffer.from(config.dataEncryptionKey, 'base64');
    if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
    return key;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Set DATA_ENCRYPTION_KEY to store connection strings');
  if (!devKeyWarned) {
    devKeyWarned = true;
    new Logger('Encryption').warn('DATA_ENCRYPTION_KEY is not set — using a development-only key');
  }
  return createHash('sha256').update('shipflow-development-only-key').digest();
}

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>` (base64url). Tampering makes decryption fail. */
export function encryptSecret(plain: string, key = encryptionKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [ENCRYPTION_VERSION, iv, cipher.getAuthTag(), data].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
}

export function decryptSecret(token: string, key = encryptionKey()): string {
  const [version, iv, tag, data] = token.split('.');
  if (version !== ENCRYPTION_VERSION || !iv || !tag || !data) throw new Error('Unreadable encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
