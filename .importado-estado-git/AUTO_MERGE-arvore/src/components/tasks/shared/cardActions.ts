import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/**
 * Estados terminais: o executor do alarme (`notify_due_tasks`, cron) só seleciona
 * tarefas com `status NOT IN ('done','cancelled')`
 * (`supabase/migrations/20260928140100_tasks_notify_due_cron.sql`), então um
 * lembrete gravado nesses estados nunca dispara.
 */
const ESTADOS_SEM_LEMBRETE: readonly WorkItemStatus[] = ['done', 'cancelled'];

/**
 * #425 / R2-MOD-057: o executor do alarme aceita a tarefa neste estado? O que o
 * card e o Sheet oferecem tem de caber nesta regra — oferecer lembrete em estado
 * terminal é anunciar um aviso que não sai.
 */
export function aceitaLembrete(status: WorkItemStatus): boolean {
  return !ESTADOS_SEM_LEMBRETE.includes(status);
}

/** Motivo mostrado no card/Sheet quando o lembrete não está disponível. */
export const MOTIVO_SEM_LEMBRETE =
  'Tarefa concluída ou cancelada não dispara alarme — reabra a tarefa para usar o lembrete.';

/**
 * Contrato das ações do card ligadas às mutations do hook (Fase C2).
 *
 * As props chegam do `TasksModule` já "por item" (recebem o `WorkItem`) e cada
 * modo/coluna as fecha na instância do card (`onComplete={() => onComplete(item)}`),
 * porque `WorkItemCard` é por item e expõe `onComplete()`, `onSnooze(minutes)` etc.
 *
 * Tudo opcional: os testes de tela montam os modos sem estas props e o card só
 * liga o que receber (o kebab/RemindChip do card degradam sozinhos).
 */
export interface WorkItemCardActions {
  /** Fase F: contagem REAL de "Fazendo" — trava o item "Fazendo" com 3/3. */
  doingCount?: number;
  /** Etapa 32: clique no ContactChip — abre a conversa no inbox. */
  onOpenContact?: (item: WorkItem) => void;
  /** Etapa 28/29: "Aguardando" sem motivo abre o Sheet no campo motivo. */
  onRequestWaitingReason?: (item: WorkItem) => void;
  /** Etapa 30: "Concluir" do kebab. */
  onComplete?: (item: WorkItem) => void;
  /** Etapa 30: "Reabrir" do kebab (item concluído). */
  onReopen?: (item: WorkItem) => void;
  /** Etapa 31: "Adiar" do RemindChip (15 min · 1 h · Amanhã 9h). */
  onSnooze?: (item: WorkItem, minutes: number | 'tomorrow9') => void;
  /** Etapa 31: "Remover" do RemindChip. */
  onClearReminder?: (item: WorkItem) => void;
  /** Etapa 31: "Escolher…" do RemindChip — abre o Sheet no campo alarme. */
  onOpenReminder?: (item: WorkItem) => void;
}
