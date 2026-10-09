/**
 * Painel de notificações do shell mobile (`MobileShell`).
 *
 * Antes ele desenhava um formato próprio de notificação e recebia uma lista
 * local — o `MobileShell` guardava `useState<Notification[]>([])` e alimentava
 * o painel (e o contador do sino) com lista vazia fixa. Agora ele consome o
 * MESMO tipo e o MESMO item da central de notificações do desktop
 * (`NotificationItem`, usado pelo `NotificationsPopover`), então a lista, o
 * contador de não lidas e as 3 ações do alarme de tarefa (`reminder_due`) são
 * os mesmos nas duas superfícies.
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import type { Notification } from '@/hooks/system/useNotifications';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkAllRead: () => void;
  /** Marca uma notificação como lida (mesmo fluxo do popover do desktop). */
  onMarkRead?: (id: string) => void;
}

export function NotificationsPanel({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onMarkRead,
}: NotificationsPanelProps) {
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-background/40 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed top-14 right-2 left-2 md:left-auto md:right-4 md:w-[380px] z-[91] max-h-[70vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden safe-area-top"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm text-foreground">Notificações</h3>
                {unreadCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-3xs font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onMarkAllRead}
                    className="h-7 text-2xs text-primary hover:text-primary"
                  >
                    Marcar todas como lidas
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 rounded-lg"
                  onClick={onClose}
                  aria-label="Fechar notificações"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                    <Bell className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">Tudo em dia!</p>
                  <p className="text-xs text-muted-foreground text-center">
                    Nenhuma notificação no momento
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkRead={onMarkRead}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
