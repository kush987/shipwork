import { TIMEOUT_MESSAGE } from './quickjs-sandbox.constants';

/** A QuickJS error dumped to the host, as one readable line ("TypeError: bad input"). */
export function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const { name, message } = err as { name?: string; message?: string };
    if (message === 'interrupted') return TIMEOUT_MESSAGE;
    if (message) return name && name !== 'Error' ? `${name}: ${message}` : message;
  }
  return String(err);
}
