import { clamp } from 'lodash-es';
import { PASSWORD_MIN_LENGTH } from '../../auth/auth.constants';
import { MENU_GAP, MENU_WIDTH } from './account.constants';
import type { MenuPosition, PasswordForm } from './account.types';

/** Opens upward from the account card, kept fully inside the viewport (icon rail, phones). */
export function menuPosition(anchor: DOMRect, viewport: { width: number; height: number }): MenuPosition {
  const left = clamp(anchor.left, MENU_GAP, Math.max(MENU_GAP, viewport.width - MENU_WIDTH - MENU_GAP));
  return { left, bottom: viewport.height - anchor.top + MENU_GAP };
}

/** Why the password form can't be sent yet, or undefined. */
export function passwordFormProblem(f: PasswordForm): string | undefined {
  if (!f.currentPassword) return 'Enter your current password';
  if (f.newPassword.length < PASSWORD_MIN_LENGTH) return `The new password needs at least ${PASSWORD_MIN_LENGTH} characters`;
  if (f.newPassword === f.currentPassword) return 'Choose a password different from the current one';
  if (f.newPassword !== f.confirm) return 'The two new passwords don’t match';
  return undefined;
}
