import type { Tone } from './ui.types';

/** 5xx danger, 4xx warning, 3xx info, otherwise success. */
export const statusTone = (status: number): Tone =>
  status >= 500 ? 'danger' : status >= 400 ? 'warning' : status >= 300 ? 'info' : 'success';
