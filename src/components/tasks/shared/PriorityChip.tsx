import type { Priority } from '@/hooks/tasks/workItem.types';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';

/**
 * D12 (etapa 170): a pílula tem SEMPRE a cor da prioridade (Média é ÂMBAR; o
 * azul é do segmento do controle), a mesma escada do `PriorityPill`.
 *
 * Etapa 80 (E.3): `--warning-text`/`--destructive-text` (tokens.css) em vez da cor
 * de PREENCHIMENTO, que como texto dava ~2:1.
 */
const PRIORITY_STYLES: Record<Priority, string> = {
  low:    'bg-muted/60 text-muted-foreground border-border/40',
  medium: 'bg-warning/15 text-[hsl(var(--warning-text))] border-warning/40',
  high:   'bg-destructive/15 text-[hsl(var(--destructive-text))] border-destructive/40',
  urgent: 'bg-destructive/20 text-[hsl(var(--destructive-text))] border-destructive',
};

/** Fase F2 (auditoria): prioridade nula ou fora do mapa não pode derrubar o card
 *  nem imprimir "undefined" — cai no padrão do banco (`medium`). */
interface Props { priority: Priority | null | undefined; compact?: boolean; }

export function PriorityChip({ priority, compact = false }: Props) {
  const p: Priority = priority != null && PRIORITY_LABELS[priority] ? priority : 'medium';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-2xs font-semibold leading-none ${PRIORITY_STYLES[p]}`}
      title={`Prioridade: ${PRIORITY_LABELS[p]}`}
    >
      {compact ? PRIORITY_LABELS[p][0] : PRIORITY_LABELS[p]}
    </span>
  );
}
