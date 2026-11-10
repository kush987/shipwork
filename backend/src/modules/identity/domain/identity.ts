import { pick } from 'lodash';
import { EMAIL, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './identity.constants';
import type { User, UserView } from './identity.types';

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const toUserView = (user: User, platformAdmins: string[] = []): UserView => ({
  ...pick(user, ['id', 'name', 'email', 'createdAt']),
  platformAdmin: platformAdmins.includes(user.email),
});

export function passwordIssue(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  return null;
}

export const emailIssue = (email: string) => (EMAIL.test(email) ? null : 'Enter a valid email address');
