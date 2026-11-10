import { STATUS_TONE } from './ui.constants';
import type { Tone } from './ui.types';

export function toneFor(status: string): Tone {
  return STATUS_TONE[status] ?? 'neutral';
}
