import type { Priority } from '@/hooks/tasks/workItem.types';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';

const PRIORITY_STYLES: Record<Priority, string> = {
  low:    'bg-muted/60 text-muted-foreground border-border/40',
  medium: 'bg-primary/15 text-primary border-primary/30',
  // Etapa 80 (E.3): `text-warning`/`text-destructive` são cor de PREENCHIMENTO — como
  // texto davam 2,1:1 (âmbar no claro) e 2,6:1 (vermelho no escuro). O par de texto
  // (`--warning-text`/`--destructive-text`, em tokens.css) fecha ≥4,5:1 nos dois modos
  // sem mexer em preenchimento nem borda.
  high:   'bg-warning/15 text-[hsl(var(--warning-text))] border-warning/40',
  urgent: 'bg-destructive/15 text-[hsl(var(--destructive-text))] border-destructive/40',
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
