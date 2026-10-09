import * as React from 'react';
import { createContext, useContext, useState, useCallback, useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { secureRandomChars } from '@/lib/secureRandom';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface Toast {
  id: string;
  message: string;
  description?: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, toast: Partial<Omit<Toast, 'id'>>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useAccessibleToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useAccessibleToast must be used within AccessibleToastProvider');
  }
  return context;
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-success" />,
  error: <AlertCircle className="w-5 h-5 text-destructive" />,
  warning: <AlertTriangle className="w-5 h-5 text-warning" />,
  info: <Info className="w-5 h-5 text-info" />,
  loading: <Loader2 className="w-5 h-5 text-primary animate-spin" />,
};

const backgrounds: Record<ToastType, string> = {
  success: 'bg-success/10 border-success/30',
  error: 'bg-destructive/10 border-destructive/30',
  warning: 'bg-warning/10 border-warning/30',
  info: 'bg-info/10 border-info/30',
  loading: 'bg-primary/10 border-primary/30',
};

// A saída do toast é a animação `exit` do tema (`animate-exit`: fade-out 0.3s +
// scale-out 0.2s). O item fica montado até ela terminar, por isso a remoção é
// adiada em 300ms — e é imediata quando o usuário pede movimento reduzido, caso em
// que o `motion-safe:` também desliga a animação.
const DURACAO_SAIDA_MS = 300;

function movimentoReduzidoPedido(): boolean {
  if (typeof window === 'undefined') return false;
  const naPagina = typeof document !== 'undefined' && document.documentElement.classList.contains('reduced-motion');
  const noSistema = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return Boolean(naPagina || noSistema);
}

interface AccessibleToastProviderProps {
  children: React.ReactNode;
}

export function AccessibleToastProvider({ children }: AccessibleToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saindo, setSaindo] = useState<ReadonlySet<string>>(() => new Set<string>());
  const agendaDeSaida = useRef<Set<string>>(new Set());

  const removeToast = useCallback((id: string) => {
    // Idempotente: fechar à mão e o auto-fechar podem cair no mesmo toast.
    if (agendaDeSaida.current.has(id)) return;
    agendaDeSaida.current.add(id);
    setSaindo((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      agendaDeSaida.current.delete(id);
      setSaindo((prev) => {
        const proximo = new Set(prev);
        proximo.delete(id);
        return proximo;
      });
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, movimentoReduzidoPedido() ? 0 : DURACAO_SAIDA_MS);
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = secureRandomChars(9, '0123456789abcdefghijklmnopqrstuvwxyz');
    setToasts((prev) => [...prev, { ...toast, id }]);

    // Auto remove after duration (except loading) — passa pela mesma saída
    // animada que o botão de fechar, para o toast não sumir de um quadro para o outro.
    if (toast.type !== 'loading' && toast.duration !== 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration || 5000);
    }

    return id;
  }, [removeToast]);

  const updateToast = useCallback((id: string, updates: Partial<Omit<Toast, 'id'>>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, updateToast }}>
      {children}
      <ToastContainer toasts={toasts} saindo={saindo} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  saindo: ReadonlySet<string>;
  onRemove: (id: string) => void;
}

function ToastContainer({ toasts, saindo, onRemove }: ToastContainerProps) {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notificações"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} saindo={saindo.has(toast.id)} onRemove={onRemove} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  saindo?: boolean;
  onRemove: (id: string) => void;
}

const ToastItem = React.forwardRef<HTMLDivElement, ToastItemProps>(function ToastItem(
  { toast, saindo = false, onRemove },
  ref
) {
  const [progress, setProgress] = React.useState(100);
  const duration = toast.type === 'loading' ? 0 : toast.duration || 5000;

  React.useEffect(() => {
    if (duration === 0) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev - (100 / (duration / 100));
        if (next <= 0) {
          clearInterval(interval);
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div
      ref={ref}
      role="alert"
      aria-atomic="true"
      className={cn(
        'relative overflow-hidden rounded-xl border p-4 shadow-lg pointer-events-auto',
        'bg-card',
        // Entrada: sobe com fade (o mesmo movimento de antes), só com movimento
        // liberado e usando a animação `slide-up` do tema. Saída: `animate-exit`.
        saindo ? 'motion-safe:animate-exit' : 'motion-safe:animate-slide-up',
        backgrounds[toast.type]
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {icons[toast.type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground">{toast.message}</p>
          {toast.description && (
            <p className="mt-1 text-sm text-muted-foreground">{toast.description}</p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-sm font-medium text-primary hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        {toast.type !== 'loading' && (
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-muted transition-colors"
            aria-label="Fechar notificação"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {duration > 0 && (
        <div
          className="absolute bottom-0 left-0 h-1 bg-current opacity-20 motion-safe:transition-all motion-safe:duration-100"
          style={{ width: `${progress}%` }}
        />
      )}
    </div>
  );
});
