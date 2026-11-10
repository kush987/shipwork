import type { ReactNode } from 'react';

export interface OneTimeSecretModalProps {
  /** The secret to show; nothing renders while null. */
  secret: string | null;
  title: string;
  description: string;
  /** Why it can't be shown again and what to do if it is lost. */
  warning: string;
  copyLabel: string;
  /** Extra guidance under the secret. */
  children?: ReactNode;
  onClose: () => void;
}
