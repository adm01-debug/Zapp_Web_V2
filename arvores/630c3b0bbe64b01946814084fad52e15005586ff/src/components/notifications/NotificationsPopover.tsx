/**
 * Popover de notificações da sidebar (Fase F, etapa 60).
 *
 * Não existia central de notificações no app (o sino do Dashboard abria a paleta
 * de comandos). Este componente é o consumidor que faltava para o
 * `useNotifications`: sino com contador de não lidas, lista e "Marcar todas como
 * lidas". Cada linha é renderizada por `NotificationItem`, que trata o
 * `reminder_due` com as 3 ações do alarme.
 */
import { AlertTriangle, Bell, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNotifications } from '@/hooks/system/useNotifications';
import { NotificationItem } from './NotificationItem';

interface NotificationsPopoverProps {
  /** Modo recolhido da sidebar: botão maior, centralizado e com tooltip. */
  collapsed?: boolean;
}

export function NotificationsPopover({ collapsed = false }: NotificationsPopoverProps) {
  const { notifications, unreadCount, loading, error, markAsRead, markAllAsRead, refetch } = useNotifications();

  const trigger = (
    <button
      type="button"
      data-tour="notifications"
      aria-label={unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : 'Notificações'}
      className={cn(
        'relative flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none',
        collapsed
          ? 'w-[38px] h-[38px] rounded-full border border-border/40 hover:border-border'
          : 'w-[28px] h-[28px] rounded-md'
      )}
    >
      <Bell className={collapsed ? 'w-[16px] h-[16px]' : 'w-[15px] h-[15px]'} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );

  const popover = (
    <Popover>
      {collapsed ? (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="text-xs">Notificações</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}

      <PopoverContent side="right" align="start" sideOffset={8} className="w-[360px] p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Notificações</h3>
            {unreadCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-3xs font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="text-2xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto overscroll-contain divide-y divide-border">
          {error && notifications.length > 0 && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 px-4 py-2 bg-destructive/10 text-destructive"
            >
              <span className="text-2xs">Não foi possível atualizar as notificações.</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refetch()}
                className="h-6 px-2 text-2xs font-medium text-destructive hover:text-destructive shrink-0"
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {loading && notifications.length === 0 ? (
            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-10 px-4">
              <Loader2 className="w-5 h-5 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
              <p className="text-xs text-muted-foreground text-center mt-2">Carregando notificações…</p>
            </div>
          ) : error && notifications.length === 0 ? (
            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-10 px-4">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Não foi possível carregar as notificações</p>
              <p className="text-xs text-muted-foreground text-center mb-3">
                Verifique a conexão e tente de novo.
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Tudo em dia!</p>
              <p className="text-xs text-muted-foreground text-center">Nenhuma notificação no momento</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={(id) => void markAsRead(id)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  return collapsed ? <div className="flex justify-center mb-1">{popover}</div> : popover;
}
