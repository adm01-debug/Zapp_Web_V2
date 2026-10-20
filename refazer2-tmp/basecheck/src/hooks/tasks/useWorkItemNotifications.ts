/**
 * useWorkItemNotifications — as 5 ações tipadas da notificação do alarme de
 * tarefa (`type: 'reminder_due'`, etapa 37 / Fase 7).
 *
 * ---------------------------------------------------------------------------
 * CONTEXTO
 * ---------------------------------------------------------------------------
 * O cron `notify_due_tasks()` grava em `notifications` com `type = 'reminder_due'`
 * e `metadata = { task_id, contact_id }`. Este hook converte ESSA notificação nas
 * ações que o toast e a central oferecem (etapa 103):
 *
 *   openTask()      → grava `?task=<id>` e navega para `?view=tasks`. O
 *                     `TasksModule` lê o `task` no 1º render e abre o Sheet;
 *                     `navigateToView` é a fonte única (emite `zapp:navigate`).
 *   openContact()   → delega para `openContactChat` (evento `open-contact-chat`,
 *                     escutado em `useRealtimeInbox`). NÃO existe `?contact=`.
 *   snooze(minutes) → rearma `remind_at` e zera `notified_at` (o alarme dispara
 *                     de novo). `'tomorrow9'` = amanhã 09:00 no fuso local.
 *   complete()      → grava `status='done'` e limpa o alarme, igual ao trigger
 *                     do banco (etapa 109).
 *   markAsRead()    → marca a notificação como lida.
 *
 * As quatro ações de fluxo marcam a notificação como lida ao concluir
 * (etapa 103). As funções puras — `notificationTargets`, `computeRemindAt`,
 * `snoozePatch`, `completePatch` — ficam exportadas para os testes da etapa 111.
 * O hook não renderiza JSX e não usa `useEffect`.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { openContactChat } from '@/components/catalog/useSendProduct';
import { tomorrowAtNine } from '@/hooks/tasks/useMyWorkItems';
import type { Notification } from '@/hooks/system/useNotifications';

/** Opções de "Adiar" oferecidas na notificação: 15 min · 1 h · Amanhã 9h. */
export type SnoozeOption = number | 'tomorrow9';

export interface WorkItemNotificationTargets {
  /** `metadata.task_id` (null quando a notificação não aponta para uma tarefa). */
  taskId: string | null;
  /** `metadata.contact_id` (null quando o alarme não tem contato). */
  contactId: string | null;
}

/** Lê `metadata.task_id` / `metadata.contact_id` com estreitamento de tipo. */
export function notificationTargets(notification: Notification | null): WorkItemNotificationTargets {
  const metadata = notification?.metadata ?? {};
  return {
    taskId: typeof metadata.task_id === 'string' ? metadata.task_id : null,
    contactId: typeof metadata.contact_id === 'string' ? metadata.contact_id : null,
  };
}

/** Alvo de `remind_at` para "Adiar": `minutes` a partir de `now`, ou amanhã 09:00. */
export function computeRemindAt(minutes: SnoozeOption, now: Date = new Date()): string {
  if (minutes === 'tomorrow9') return tomorrowAtNine(now).toISOString();
  return new Date(now.getTime() + Math.max(1, minutes) * 60_000).toISOString();
}

/** Patch que rearma o alarme — `notified_at` zerado libera um novo disparo. */
export function snoozePatch(
  minutes: SnoozeOption,
  now: Date = new Date(),
): { remind_at: string; notified_at: null } {
  return { remind_at: computeRemindAt(minutes, now), notified_at: null };
}

/** Patch de conclusão: mesmo efeito do trigger de estado do banco (limpa o alarme). */
export function completePatch(
  now: Date = new Date(),
): { status: 'done'; completed_at: string; remind_at: null; notified_at: null } {
  return { status: 'done', completed_at: now.toISOString(), remind_at: null, notified_at: null };
}

/** Marca usada quando a notificação não traz `task_id` utilizável. */
const MISSING_TASK = 'missing_task_id';

export interface WorkItemNotificationActions {
  taskId: string | null;
  contactId: string | null;
  /** Navega para a Tarefa e abre o Sheet (`?view=tasks&task=<id>`). */
  openTask: () => void;
  /** Abre a conversa do contato no inbox (quando há `metadata.contact_id`). */
  openContact: () => void;
  /** Adia o alarme: `minutes` a partir de agora, ou amanhã 09:00 (`'tomorrow9'`). */
  snooze: (minutes: SnoozeOption) => Promise<void>;
  /** Conclui a tarefa e limpa o alarme. */
  complete: () => Promise<void>;
  /** Marca a notificação do alarme como lida. */
  markAsRead: () => Promise<void>;
  /** Alguma ação em andamento — use para desabilitar os botões. */
  isPending: boolean;
}

export function useWorkItemNotifications(notification: Notification | null): WorkItemNotificationActions {
  const queryClient = useQueryClient();
  const { taskId, contactId } = notificationTargets(notification);
  const notificationId = notification?.id ?? null;
  const alreadyRead = notification?.is_read ?? false;

  const invalidateTasks = () => {
    void queryClient.invalidateQueries({ queryKey: ['work-items'] });
    void queryClient.invalidateQueries({ queryKey: ['work-items-badge'] });
  };

  const markReadMutation = useMutation({
    mutationFn: async () => {
      if (!notificationId || alreadyRead) return;
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onError: (error: Error) => log.error('Erro ao marcar notificação como lida:', error),
  });

  /** Nunca rejeita: o erro já virou toast/log no `onError` da mutation. */
  const markAsRead = async (): Promise<void> => {
    try {
      await markReadMutation.mutateAsync();
    } catch {
      /* onError da mutation já registrou */
    }
  };

  const snoozeMutation = useMutation({
    mutationFn: async (minutes: SnoozeOption) => {
      if (!taskId) throw Object.assign(new Error(MISSING_TASK), { blocked: MISSING_TASK });
      const { error } = await supabase
        .from('conversation_tasks')
        .update(snoozePatch(minutes))
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: (_data, minutes) => {
      invalidateTasks();
      toast.success(minutes === 'tomorrow9' ? 'Aviso adiado para amanhã, 9h' : 'Aviso adiado');
      void markAsRead();
    },
    onError: (error: Error) => {
      log.error('Erro ao adiar alarme de tarefa:', error);
      if ((error as { blocked?: string }).blocked === MISSING_TASK) {
        toast.error('Este aviso não está ligado a uma tarefa');
      } else {
        toast.error('Erro ao adiar o aviso');
      }
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw Object.assign(new Error(MISSING_TASK), { blocked: MISSING_TASK });
      const { error } = await supabase
        .from('conversation_tasks')
        .update(completePatch())
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTasks();
      toast.success('Tarefa concluída');
      void markAsRead();
    },
    onError: (error: Error) => {
      log.error('Erro ao concluir tarefa do alarme:', error);
      if ((error as { blocked?: string }).blocked === MISSING_TASK) {
        toast.error('Este aviso não está ligado a uma tarefa');
      } else {
        toast.error('Erro ao concluir a tarefa');
      }
    },
  });

  const openTask = () => {
    if (taskId) {
      const url = new URL(window.location.href);
      url.searchParams.set('task', taskId);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    navigateToView('tasks');
    void markAsRead();
  };

  const openContact = () => {
    if (contactId) openContactChat(contactId);
    void markAsRead();
  };

  const snooze = async (minutes: SnoozeOption): Promise<void> => {
    try {
      await snoozeMutation.mutateAsync(minutes);
    } catch {
      /* onError da mutation já avisou */
    }
  };

  const complete = async (): Promise<void> => {
    try {
      await completeMutation.mutateAsync();
    } catch {
      /* onError da mutation já avisou */
    }
  };

  return {
    taskId,
    contactId,
    openTask,
    openContact,
    snooze,
    complete,
    markAsRead,
    isPending: snoozeMutation.isPending || completeMutation.isPending || markReadMutation.isPending,
  };
}
