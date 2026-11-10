import type { ButtonVariant } from './ui.types';

export interface CopyButtonProps {
  text: string;
  label?: string;
  iconOnly?: boolean;
  variant?: Exclude<ButtonVariant, 'danger'>;
}
