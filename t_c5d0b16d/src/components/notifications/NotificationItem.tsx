/**
 * Item da lista do popover de notificações (Fase F, etapa 60).
 *
 * O caso `reminder_due` (alarme de tarefa) ganha ícone `BellRing` em `warning` e
 * as 3 ações do aviso ("Abrir" · "Adiar ▾" · "Concluir"). Os demais tipos seguem
 * o visual anterior — ícone por tipo, título, mensagem e data relativa — e o
 * clique marca como lida.
 */
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  Info,
  MessageSquare,
  Phone,
  Target,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Notification } from '@/hooks/system/useNotifications';
import { ReminderNotificationActions } from './ReminderNotification';

const ICON_BY_TYPE: Record<Notification['type'], ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  sla: AlertTriangle,
  sentiment: MessageSquare,
  sentiment_alert: AlertTriangle,
  goal: Target,
  incoming_call: Phone,
  reminder_due: BellRing,
};

const TONE_BY_TYPE: Record<Notification['type'], string> = {
  info: 'text-muted-foreground bg-muted',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/10',
  error: 'text-destructive bg-destructive/10',
  sla: 'text-destructive bg-destructive/10',
  sentiment: 'text-primary bg-primary/10',
  sentiment_alert: 'text-warning bg-warning/10',
  goal: 'text-primary bg-primary/10',
  incoming_call: 'text-primary bg-primary/10',
  reminder_due: 'text-warning bg-warning/10',
};

interface NotificationItemProps {
  notification: Notification;
  /** Chamado ao clicar num item comum (não-`reminder_due`). */
  onMarkRead?: (id: string) => void;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const Icon = ICON_BY_TYPE[notification.type] ?? Bell;
  const tone = TONE_BY_TYPE[notification.type] ?? 'text-muted-foreground bg-muted';
  const isReminder = notification.type === 'reminder_due';
  const isUnread = !notification.is_read;
  const when = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR });

  const body = (
    <>
      <span className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', tone)}>
        <Icon className="w-4 h-4" />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn('text-xs leading-tight', isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>
            {notification.title}
          </p>
          {isUnread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
        </div>
        <p className="text-2xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-3xs text-muted-foreground mt-1">{when}</p>
        {isReminder && (
          <div className="mt-2">
            <ReminderNotificationActions notification={notification} />
          </div>
        )}
      </div>
    </>
  );

  // No aviso de alarme a linha é um contêiner neutro: os 3 botões são os únicos
  // alvos de clique (um `<button>` em volta seria HTML inválido e roubaria o clique).
  if (isReminder) {
    return <div className="w-full flex items-start gap-3 px-4 py-3 text-left bg-warning/[0.04]">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onMarkRead?.(notification.id)}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        isUnread ? 'bg-primary/[0.03] hover:bg-primary/[0.06]' : 'hover:bg-muted/50'
      )}
    >
      {body}
    </button>
  );
}
