import { CircleCheck, CircleX, Info, type LucideIcon } from 'lucide-react';
import type { ToastKind } from './Toast.types';

/** Older toasts kept on screen when a new one arrives. */
export const TOASTS_KEPT = 3;

/** How long a toast stays up; errors stay longer. */
export const TOAST_MS = 3500;
export const ERROR_TOAST_MS = 6000;

export const TOAST_ICON: Record<ToastKind, LucideIcon> = {
  success: CircleCheck,
  error: CircleX,
  info: Info,
};
