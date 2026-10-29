import type { Priority } from '@/hooks/tasks/workItem.types';
// Os rótulos vêm do `.ts` de labels — nunca do `PriorityChip.tsx` (exportar
// constante de arquivo de componente conta dívida nova no react-refresh).
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';

/**
 * Um par de cor por prioridade (D12). Os valores `high`/`urgent` usam os tokens
 * de TEXTO (`--warning-text`/`--destructive-text`): a cor crua é de
 * PREENCHIMENTO e como texto ficava em ~2:1. Mesma decisão do `PriorityChip`,
 * agora num primitivo sem o `compact` obrigatório.
 */
const PRIORITY_STYLES: Record<Priority, string> = {
  low:    'bg-muted/60 text-muted-foreground border-border/40',
  medium: 'bg-primary/15 text-primary border-primary/30',
  high:   'bg-warning/15 text-[hsl(var(--warning-text))] border-warning/40',
  urgent: 'bg-destructive/15 text-[hsl(var(--destructive-text))] border-destructive/40',
};

interface Props {
  priority: Priority | null | undefined;
  /** Só a inicial — para a linha da Agenda. O nome acessível continua completo. */
  compact?: boolean;
  className?: string;
}

/**
 * Etapa 069 (D12) — pílula de prioridade do módulo de Tarefas.
 *
 * Prioridade nula ou fora do mapa cai no padrão do banco (`medium`) em vez de
 * derrubar o card ou imprimir "undefined".
 *
 * No modo compacto o `<span>` mostra só a inicial, então o nome completo vai
 * pelo `aria-label` com `role="img"`: `aria-label` em elemento genérico (sem
 * papel) é IGNORADO por leitores de tela — com o papel de imagem, "Média" vira
 * o nome acessível.
 */
export function PriorityPill({ priority, compact = false, className = '' }: Props) {
  const p: Priority = priority != null && PRIORITY_LABELS[priority] ? priority : 'medium';
  const texto = PRIORITY_LABELS[p];

  return (
    <span
      data-testid="priority-pill"
      data-priority={p}
      title={`Prioridade: ${texto}`}
      {...(compact ? { role: 'img', 'aria-label': texto } : {})}
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-2xs font-semibold leading-none ${PRIORITY_STYLES[p]} ${className}`}
    >
      {compact ? texto[0] : texto}
    </span>
  );
}
