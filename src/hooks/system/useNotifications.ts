import { useState, useEffect, useCallback, useMemo, useRef, createElement } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '../auth/useAuth';
import { log } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { ReminderToast } from '@/components/notifications/ReminderNotification';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'sla' | 'sentiment' | 'sentiment_alert' | 'goal' | 'incoming_call' | 'reminder_due';
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  // R2-PLAT-002 (#440): o contador é DERIVADO da lista reconciliada — a mesma que
  // o popover renderiza — em vez de um estado à parte ajustado por delta em cada
  // transição. Assim ele não diverge em leitura repetida, UPDATE remoto antes do
  // retorno HTTP, INSERT lido/duplicado nem DELETE remoto.
  const unreadCount = useMemo(
    () => notifications.filter(n => !n.is_read).length,
    [notifications]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const typedData = (data || []) as Notification[];
      if (isMountedRef.current) {
        setNotifications(typedData);
      }
    } catch (error) {
      log.error('Error fetching notifications:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotification = payload.new as Notification;
            // Um INSERT que repete um id já reconciliado é a mesma linha (ex.: o
            // eco do próprio insert): substitui no lugar, não duplica na lista.
            setNotifications(prev =>
              prev.some(n => n.id === newNotification.id)
                ? prev.map(n => (n.id === newNotification.id ? newNotification : n))
                : [newNotification, ...prev]
            );
            // Fase F (etapa 61): o alarme de tarefa chega em tempo real pelo
            // mesmo canal. Mostra o toast com as 3 ações do aviso. Sem som de
            // propósito — o app não tem padrão sonoro para alarme de tarefa.
            if (newNotification.type === 'reminder_due') {
              toast.custom(
                (toastId) => createElement(ReminderToast, { notification: newNotification, toastId }),
                { duration: 15_000 }
              );
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedNotification = payload.new as Notification;
            setNotifications(prev =>
              prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setNotifications(prev => prev.filter(n => n.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
    } catch (error) {
      log.error('Error marking notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
    } catch (error) {
      log.error('Error marking all as read:', error);
    }
  }, [user]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
      
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      log.error('Error deleting notification:', error);
    }
  }, []);

  const clearAll = useCallback(async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      
      setNotifications([]);
    } catch (error) {
      log.error('Error clearing notifications:', error);
    }
  }, [user]);

  const createNotification = useCallback(async (
    title: string,
    message: string,
    type: Notification['type'] = 'info',
    metadata: Json = {}
  ) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .insert([{
          user_id: user.id,
          title,
          message,
          type,
          metadata
        }]);

      if (error) throw error;
    } catch (error) {
      log.error('Error creating notification:', error);
    }
  }, [user]);

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    createNotification,
    refetch: fetchNotifications
  };
}
