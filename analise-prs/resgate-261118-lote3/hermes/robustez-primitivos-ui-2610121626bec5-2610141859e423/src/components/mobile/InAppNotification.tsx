import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X } from 'lucide-react';

export interface InAppNotificationData {
  id: string;
  title: string;
  body: string;
  avatar?: string;
  onClick?: () => void;
}

interface InAppNotificationProps {
  notification: InAppNotificationData | null;
  duration?: number;
  onDismiss: () => void;
}

export function InAppNotification({ notification, duration = 4000, onDismiss }: InAppNotificationProps) {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [notification, duration, onDismiss]);

  const initials = notification?.title
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2) || '?';

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ y: -80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -80, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          drag="y"
          dragConstraints={{ top: -100, bottom: 0 }}
          onDragEnd={(_, info) => { if (info.offset.y < -30) onDismiss(); }}
          className="fixed top-2 left-2 right-2 z-[100] safe-area-top cursor-pointer"
          onClick={() => {
            notification.onClick?.();
            onDismiss();
          }}
        >
          <div className="bg-card/95 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl p-3 flex items-center gap-3 mx-auto max-w-md">
            <Avatar className="w-10 h-10 shrink-0">
              <AvatarImage src={notification.avatar} alt={notification.title || 'Notificação'} />
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{notification.title}</p>
              <p className="text-xs text-muted-foreground truncate">{notification.body}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="shrink-0 p-1 rounded-full hover:bg-muted active:scale-95 transition-transform touch-manipulation"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
