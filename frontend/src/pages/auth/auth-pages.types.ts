import type { ReactNode } from 'react';
import type { SignupInput } from '../../api/types';

export interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/** Field → problem, for the sign-up form. */
export type SignupProblems = Partial<Record<keyof SignupInput, string>>;
