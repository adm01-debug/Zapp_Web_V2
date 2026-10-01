import type { WorkItem } from '@/hooks/tasks/workItem.types';

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
