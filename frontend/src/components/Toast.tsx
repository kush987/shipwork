import { X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ERROR_TOAST_MS, TOAST_ICON, TOAST_MS, TOASTS_KEPT } from './Toast.constants';
import { ToastContext } from './Toast.context';
import type { ToastApi, ToastItem, ToastKind, ToastProviderProps } from './Toast.types';

export function ToastProvider({ children }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-TOASTS_KEPT), { id, kind, title, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? ERROR_TOAST_MS : TOAST_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, m) => push('success', t, m),
      error: (t, m) => push('error', t, m),
      info: (t, m) => push('info', t, m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = TOAST_ICON[t.kind];
          return (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              <Icon size={18} className="toast-icon" />
              <div className="toast-body">
                <div className="toast-title">{t.title}</div>
                {t.message && <div className="toast-message">{t.message}</div>}
              </div>
              <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
