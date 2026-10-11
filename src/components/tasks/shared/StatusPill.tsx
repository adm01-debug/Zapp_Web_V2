import { KANBAN_COLUMNS, type WorkItemStatus } from '@/hooks/tasks/workItem.types';

/**
 * Um par de cor por estado. "Fazendo" é azul CHEIO (é o foco do dia) e
 * "Aguardando" usa o token de TEXTO do aviso — o valor cru é preenchimento e
 * como texto não fecharia contraste. "Cancelada" sai riscada, para não competir
 * visualmente com o que ainda está de pé.
 */
const STATUS_STYLES: Record<WorkItemStatus, string> = {
  backlog:   'bg-muted/60 text-muted-foreground border-border/40',
  todo:      'bg-primary/10 text-primary border-primary/30',
  doing:     'bg-primary text-primary-foreground border-primary',
  waiting:   'bg-warning/15 text-[hsl(var(--warning-text))] border-warning/40',
  done:      'bg-success text-success-foreground border-success',
  cancelled: 'bg-muted/40 text-muted-foreground border-border/40 line-through',
};

/** Rótulo do estado: o do quadro quando existe; "Cancelada" para o terminal. */
function rotuloDoStatus(status: WorkItemStatus): string {
  return KANBAN_COLUMNS.find((c) => c.status === status)?.label ?? 'Cancelada';
}

interface Props {
  status: WorkItemStatus;
  className?: string;
}

/** Etapa 069 — pílula de estado do módulo de Tarefas. */
export function StatusPill({ status, className = '' }: Props) {
  const estilo = STATUS_STYLES[status] ?? STATUS_STYLES.backlog;
  const rotulo = rotuloDoStatus(status);

  return (
    <span
      data-testid="status-pill"
      data-status={status}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold leading-none ${estilo} ${className}`}
    >
      {rotulo}
    </span>
  );
}
