/**
 * `MorphButton` — um botão, quatro caras, **mesma largura**.
 *
 * Estados: `idle` (o texto que você passou), `loading`, `success`, `error`. Os
 * rótulos ficam empilhados na MESMA célula do grid (só o ativo aparece), então o
 * botão não muda de largura quando muda de estado — o salto de layout que
 * desalinha a barra de ações do chat.
 *
 * Acessibilidade: `aria-busy` enquanto carrega, `disabled` nesse estado, e um
 * `role="status"` que anuncia o rótulo novo quando o estado muda ("Enviado",
 * "Falhou…"). Com movimento reduzido o ícone de carregar NÃO gira.
 */
import { useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneClasses, type MotionTone } from './tone';

export type MorphState = 'idle' | 'loading' | 'success' | 'error';

export interface MorphButtonProps {
  state?: MorphState;
  onClick?: () => void;
  /** Rótulo do estado `idle` (o conteúdo normal do botão). */
  children: string;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  /** Cor do estado `success`. */
  tone?: MotionTone;
  /** Cor do estado `error`. */
  errorTone?: MotionTone;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

const DEFAULT_LABELS: Record<Exclude<MorphState, 'idle'>, string> = {
  loading: 'Enviando…',
  success: 'Enviado',
  error: 'Falhou',
};

export function MorphButton({
  state = 'idle',
  onClick,
  children,
  loadingLabel = DEFAULT_LABELS.loading,
  successLabel = DEFAULT_LABELS.success,
  errorLabel = DEFAULT_LABELS.error,
  tone = 'success',
  errorTone = 'destructive',
  disabled = false,
  className,
  'data-testid': testId = 'morph-button',
}: MorphButtonProps) {
  const reduce = useReducedMotion() ?? false;
  const carregando = state === 'loading';
  const bloqueado = disabled || carregando;

  const cells: { key: MorphState; label: string; Icon?: LucideIcon; iconClass?: string }[] = [
    { key: 'idle', label: children },
    { key: 'loading', label: loadingLabel, Icon: Loader2, iconClass: cn(!reduce && 'animate-spin') },
    { key: 'success', label: successLabel, Icon: Check, iconClass: toneClasses(tone).text },
    { key: 'error', label: errorLabel, Icon: AlertTriangle, iconClass: toneClasses(errorTone).text },
  ];

  return (
    <button
      type="button"
      data-testid={testId}
      data-state={state}
      data-motion={reduce ? 'reduced' : 'full'}
      aria-busy={carregando || undefined}
      disabled={bloqueado}
      onClick={onClick}
      className={cn(
        'relative inline-grid place-items-center rounded-md border border-border px-4 py-2 text-sm font-medium',
        'bg-card text-card-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {cells.map(({ key, label, Icon, iconClass }) => {
        const ativo = key === state;
        return (
          <span
            key={key}
            aria-hidden={ativo ? undefined : true}
            data-testid={`morph-button-label-${key}`}
            className={cn(
              'col-start-1 row-start-1 inline-flex items-center justify-center gap-2 whitespace-nowrap',
              !ativo && 'invisible',
            )}
          >
            {Icon ? <Icon className={cn('h-4 w-4', iconClass)} aria-hidden="true" /> : null}
            {label}
          </span>
        );
      })}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'idle' ? '' : cells.find((cell) => cell.key === state)?.label}
      </span>
    </button>
  );
}
