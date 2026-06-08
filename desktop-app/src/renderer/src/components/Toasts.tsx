import { useToast } from '@/state/toast';
import { Icon } from './Icon';

export function Toasts() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast__msg">{t.message}</span>
          <button
            className="toast__close"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
