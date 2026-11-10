import type { ExecutionMode } from '../api/types';
import type { Tone } from './ui.types';

/** Label and tone per way an execution can be started. */
export const EXECUTION_MODE_BADGE: Record<ExecutionMode, { label: string; tone: Tone }> = {
  trigger: { label: 'trigger', tone: 'accent' },
  test: { label: 'test', tone: 'violet' },
  manual: { label: 'manual', tone: 'info' },
  replay: { label: 'replay', tone: 'neutral' },
  api: { label: 'API call', tone: 'success' },
  schedule: { label: 'schedule', tone: 'warning' },
};
