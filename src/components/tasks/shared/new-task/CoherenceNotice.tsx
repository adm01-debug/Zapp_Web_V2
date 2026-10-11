import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  checkRemindCoherence,
  type RemindCoherenceState,
} from '@/hooks/tasks/workItemPresets';

/** Cor e ícone de cada estado — o TEXTO sempre no token AA do módulo. */
const ESTILO: Record<
  RemindCoherenceState,
  { Icone: typeof CheckCircle2; classes: string }
> = {
  ok: { Icone: CheckCircle2, classes: 'border-success/30 bg-success/10 text-success' },
  after_due: {
    Icone: AlertTriangle,
    classes: 'border-warning/30 bg-warning/10 text-[hsl(var(--warning-text))]',
  },
  no_due: {
    Icone: Info,
    classes: 'border-warning/30 bg-warning/10 text-[hsl(var(--warning-text))]',
  },
  in_past: {
    Icone: AlertCircle,
    classes: 'border-destructive/30 bg-destructive/10 text-[hsl(var(--destructive-text))]',
  },
};

interface Props {
  remindAt: string | null;
  dueDate: string | null;
  /** Põe o lembrete 1 h antes do prazo (só quando o lembrete passou do prazo). */
  onFix: () => void;
}

/**
 * Etapa 163 (plano, linha 442; imagem 04, seção 3.4) — a frase de coerência
 * prazo × lembrete logo abaixo dos dois campos.
 *
 * A decisão é do `checkRemindCoherence` (função pura da etapa 162), não de um
 * `if` daqui: verde quando o lembrete está no futuro e antes do prazo; âmbar
 * quando não há prazo para comparar ou o lembrete passou do prazo (com o atalho
 * "Ajustar para 1 h antes do prazo"); vermelho quando o lembrete já passou.
 *
 * As cores saem do par de TEXTO do módulo (`text-success`, `--warning-text`,
 * `--destructive-text`) — AA nos dois temas — e não do token de preenchimento.
 * Sem lembrete não há o que conferir e o aviso não aparece.
 */
export function CoherenceNotice({ remindAt, dueDate, onFix }: Props) {
  const { state, message } = checkRemindCoherence(remindAt, dueDate);
  if (!message) return null;

  const { Icone, classes } = ESTILO[state];

  return (
    <div
      role="status"
      data-state={state}
      data-testid="new-task-remind-coherence"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${classes}`}
    >
      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="space-y-1.5">
        <p>{message}</p>
        {state === 'after_due' && (
          <button
            type="button"
            onClick={onFix}
            data-testid="new-task-remind-fix"
            className="inline-flex h-10 items-center rounded-md border border-warning/40 px-3 text-xs font-semibold text-[hsl(var(--warning-text))] transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ajustar para 1 h antes do prazo
          </button>
        )}
      </div>
    </div>
  );
}
