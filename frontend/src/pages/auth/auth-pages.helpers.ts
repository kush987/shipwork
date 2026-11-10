import type { SignupInput } from '../../api/types';
import { PASSWORD_MIN_LENGTH } from '../../auth/auth.constants';
import type { SignupProblems } from './auth-pages.types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const passwordProblem = (password: string) =>
  password.length >= PASSWORD_MIN_LENGTH ? undefined : `At least ${PASSWORD_MIN_LENGTH} characters`;

export const emailProblem = (email: string) => (EMAIL.test(email.trim()) ? undefined : 'Enter a valid email address');

/** What the server would reject, checked before sending. */
export function signupProblems(input: SignupInput): SignupProblems {
  const problems: SignupProblems = {
    name: input.name.trim() ? undefined : 'Enter your name',
    email: emailProblem(input.email),
    password: passwordProblem(input.password),
    workspaceName: input.workspaceName.trim() ? undefined : 'Name your workspace, e.g. your company',
  };
  return Object.fromEntries(Object.entries(problems).filter(([, v]) => v)) as SignupProblems;
}
