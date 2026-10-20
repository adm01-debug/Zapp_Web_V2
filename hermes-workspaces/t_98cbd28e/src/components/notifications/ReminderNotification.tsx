/**
 * Avisos de alarme de tarefa (`reminder_due`) — Fase F.
 *
 * `ReminderNotificationActions` é o miolo compartilhado pelas duas superfícies do
 * aviso (etapa 60/61): o item da lista no popover de notificações e o toast em
 * tempo real. São as 3 ações do plano — "Abrir", "Adiar ▾" (15 min · 1 h ·
 * Amanhã 9h) e "Concluir" — cada uma delegada a `useWorkItemNotifications`, que
 * já marca a notificação como lida ao concluir.
 *
 * `ReminderToast` é o card que o `useNotifications` injeta via `toast.custom`
 * (sonner) quando o cron `notify_due_tasks()` grava a notificação. Sem som de
 * propósito: o app não tem padrão sonoro para avisos de alarme.
 */
import { BellRing, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkItemNotifications } from '@/hooks/tasks/useWorkItemNotifications';
import type { Notification } from '@/hooks/system/useNotifications';

interface ReminderNotificationActionsProps {
  notification: Notification;
  /** Disparado depois de qualquer ação — o toast usa para se fechar. */
  onAction?: () => void;
}

export function ReminderNotificationActions({ notification, onAction }: ReminderNotificationActionsProps) {
  const { taskId, openTask, snooze, complete, isPending } = useWorkItemNotifications(notification);
  // Sem `task_id` utilizável nenhuma ação de fluxo faz sentido (o hook já
  // bloqueia no banco) — os botões ficam inertes em vez de falhar no clique.
  const disabled = isPending || !taskId;

  const run = (action: () => void | Promise<void>) => {
    onAction?.();
    void action();
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        className="h-8 px-2.5 text-xs"
        disabled={disabled}
        onClick={() => run(openTask)}
      >
        Abrir
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" disabled={disabled}>
            Adiar
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem onSelect={() => run(() => snooze(15))}>15 minutos</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => snooze(60))}>1 hora</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => snooze('tomorrow9'))}>Amanhã, 9h</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 px-2.5 text-xs"
        disabled={disabled}
        onClick={() => run(complete)}
      >
        Concluir
      </Button>
    </div>
  );
}

interface ReminderToastProps {
  notification: Notification;
  /** Id devolvido por `toast.custom`, para fechar o toast ao escolher uma ação. */
  toastId: string | number;
}

export function ReminderToast({ notification, toastId }: ReminderToastProps) {
  const contact = typeof notification.metadata?.contact_name === 'string'
    ? notification.metadata.contact_name
    : null;

  return (
    <div className="w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-border/60 bg-card p-3 shadow-lg">
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-warning bg-warning/10">
          <BellRing className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{notification.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {contact ? `${contact} · ${notification.message}` : notification.message}
          </p>
        </div>
      </div>
      <div className="mt-2.5 pl-[42px]">
        <ReminderNotificationActions notification={notification} onAction={() => toast.dismiss(toastId)} />
      </div>
    </div>
  );
}
