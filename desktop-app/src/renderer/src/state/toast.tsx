import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppError } from '@shared/types';

export interface ToastItem {
  id: number;
  kind: 'error' | 'success';
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  notify: (kind: ToastItem['kind'], message: string) => void;
  notifyError: (error: AppError) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastItem['kind'], message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3000);
    },
    [dismiss],
  );

  const notifyError = useCallback(
    (error: AppError) => notify('error', error.message),
    [notify],
  );

  return (
    <ToastContext.Provider value={{ toasts, notify, notifyError, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
