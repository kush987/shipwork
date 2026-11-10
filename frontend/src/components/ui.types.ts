import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'violet';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}

export interface StatusPillProps {
  status: string;
  label?: string;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  loading?: boolean;
};

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export interface SkeletonProps {
  w?: number | string;
  h?: number;
  r?: number;
}

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export interface DrawerProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export interface FieldProps {
  label: string;
  help?: ReactNode;
  required?: boolean;
  children: ReactNode;
  error?: string;
}

export interface FieldGroupProps {
  label: string;
  help?: ReactNode;
  required?: boolean;
  /** Label left, control right (for a single switch). */
  inline?: boolean;
  children: ReactNode;
}

export interface JsonBlockProps {
  label: string;
  value: unknown;
  tone?: 'danger';
  /** Shown expanded at first (default true); the label toggles it either way. */
  defaultOpen?: boolean;
}

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  title?: string;
}
