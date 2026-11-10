import { isPlainObject } from 'lodash';
import { REDACTED, SENSITIVE_KEY } from './redaction.constants';

/**
 * A copy of `value` with the values of secret-looking keys (password, passwordHash, token,
 * secret, authorization, apiKey, cookie…) replaced, at any depth. Used for stored run history:
 * the run itself sees real values; what is kept afterwards doesn't.
 */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSecrets) as T;
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, SENSITIVE_KEY.test(key) && v !== null && v !== undefined && v !== '' ? REDACTED : redactSecrets(v)]),
  ) as T;
}
