import { COPY_SUFFIX, WORKFLOW_NAME_MAX_LENGTH } from './workflows.constants';

/** "Create order" → "Create order (copy)", trimmed to the name limit. */
export const suggestCopyName = (name: string) => `${name.trim().slice(0, WORKFLOW_NAME_MAX_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;

/** Names are compared the way the backend does: trimmed, case-insensitive. */
export const isSameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Why the chosen name can't be used, or undefined when it's fine. */
export function copyNameError(name: string, sourceName: string): string | undefined {
  if (!name.trim()) return 'Give the copy a name';
  if (isSameName(name, sourceName)) return 'Choose a name different from the original';
  return undefined;
}

/** What pausing does, asked before it happens (it stops live traffic). */
export const pauseQuestion = (name: string) =>
  `Pause “${name}”?\n\nIts endpoints will answer 503, and schedules, events, record changes and Run workflow steps won't start it until you resume it. Runs already going finish, and test runs still work.`;
