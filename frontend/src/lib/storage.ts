import type { StorageArea } from './storage.types';

const area = (kind: StorageArea): Storage => (kind === 'local' ? localStorage : sessionStorage);

/** A stored value, or null when it's missing or storage is unavailable (private mode, blocked cookies). */
export function readStorage(kind: StorageArea, key: string): string | null {
  try {
    return area(kind).getItem(key);
  } catch {
    return null;
  }
}

/** Stores a value; silently does nothing when storage is unavailable. */
export function writeStorage(kind: StorageArea, key: string, value: string): void {
  try {
    area(kind).setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** Removes a value; silently does nothing when storage is unavailable. */
export function removeStorage(kind: StorageArea, key: string): void {
  try {
    area(kind).removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
