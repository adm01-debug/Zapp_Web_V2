import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, MessageSquare, UserPlus, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface Notification {
  id: string;
  type: 'message' | 'assignment' | 'sla_warning' | 'resolved' | 'system';
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  contactName?: string;
  contactAvatar?: string;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkAllRead: () => void;
  onNotificationClick?: (notification: Notification) => void;
}

const typeConfig: Record<Notification['type'], { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  message: { icon: MessageSquare, color: 'text-primary bg-primary/10' },
  assignment: { icon: UserPlus, color: 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]' },
  sla_warning: { icon: AlertTriangle, color: 'text-destructive bg-destructive/10' },
  resolved: { icon: CheckCircle, color: 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]' },
  system: { icon: Clock, color: 'text-muted-foreground bg-muted' },
};

export function NotificationsPanel({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onNotificationClick,
}: NotificationsPanelProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

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
                  {notifications.map((notification) => {
                    const config = typeConfig[notification.type];
                    const Icon = config.icon;
                    return (
                      <motion.button
                        key={notification.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => onNotificationClick?.(notification)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors touch-manipulation',
                          !notification.read
                            ? 'bg-primary/[0.03] hover:bg-primary/[0.06]'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        {/* Icon */}
                        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', config.color)}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              'text-xs leading-tight',
                              !notification.read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
                            )}>
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                            )}
                          </div>
                          <p className="text-2xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.description}
                          </p>
                          <p className="text-3xs text-muted-foreground/60 mt-1">
                            {formatDistanceToNow(notification.timestamp, { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
