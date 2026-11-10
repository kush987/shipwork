import { createContext } from 'react';
import type { ToastApi } from './Toast.types';

export const ToastContext = createContext<ToastApi | null>(null);
