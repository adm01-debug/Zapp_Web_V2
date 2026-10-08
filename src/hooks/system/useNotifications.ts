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

interface NotificationsState {
  userId: string | null;
  items: Notification[];
}

interface NotificationErrorState {
  userId: string | null;
  error: Error | null;
}

export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [notificationsState, setNotificationsState] = useState<NotificationsState>({ userId: null, items: [] });
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<NotificationErrorState>({ userId: null, error: null });
  const isMountedRef = useRef(true);
  const activeUserIdRef = useRef<string | null>(userId);

  const notifications = useMemo(
    () => notificationsState.userId === userId ? notificationsState.items : [],
    [notificationsState, userId]
  );
  const error = errorState.userId === userId ? errorState.error : null;
  const visibleLoading = loading || (
    Boolean(userId) &&
    notificationsState.userId !== userId &&
    errorState.userId !== userId
  );

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

  useEffect(() => {
    activeUserIdRef.current = userId;
  }, [userId]);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;

    const requestUserId = userId;

    try {
      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', requestUserId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;

      const typedData = (data || []) as Notification[];
      if (isMountedRef.current && activeUserIdRef.current === requestUserId) {
        setNotificationsState({ userId: requestUserId, items: typedData });
        setErrorState({ userId: requestUserId, error: null });
      }
    } catch (err) {
      log.error('Error fetching notifications:', err);
      // Uma falha de consulta deixa de ser silenciosa. A lista anterior só é
      // exibida quando foi confirmada para o MESMO user.id da consulta; após
      // troca de usuário o retorno do hook fica sem itens para não vazar outra sessão.
      if (isMountedRef.current && activeUserIdRef.current === requestUserId) {
        setErrorState({
          userId: requestUserId,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    } finally {
      if (isMountedRef.current && activeUserIdRef.current === requestUserId) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchNotifications();
    });
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotification = payload.new as Notification;
            // Um INSERT que repete um id já reconciliado é a mesma linha (ex.: o
            // eco do próprio insert): substitui no lugar, não duplica na lista.
            setNotificationsState(prev => {
              const currentItems = prev.userId === userId ? prev.items : [];
              const items = currentItems.some(n => n.id === newNotification.id)
                ? currentItems.map(n => (n.id === newNotification.id ? newNotification : n))
                : [newNotification, ...currentItems];
              return { userId, items };
            });
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
            setNotificationsState(prev => ({
              userId,
              items: (prev.userId === userId ? prev.items : []).map(n =>
                n.id === updatedNotification.id ? updatedNotification : n
              ),
            }));
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setNotificationsState(prev => ({
              userId,
              items: (prev.userId === userId ? prev.items : []).filter(n => n.id !== deletedId),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
      
      setNotificationsState(prev => ({
        ...prev,
        items: prev.items.map(n =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        ),
      }));
    } catch (error) {
      log.error('Error marking notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      
      setNotificationsState(prev => ({
        ...prev,
        items: prev.items.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })),
      }));
    } catch (error) {
      log.error('Error marking all as read:', error);
    }
  }, [userId]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
      
      setNotificationsState(prev => ({
        ...prev,
        items: prev.items.filter(n => n.id !== notificationId),
      }));
    } catch (error) {
      log.error('Error deleting notification:', error);
    }
  }, []);

  const clearAll = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      
      setNotificationsState({ userId, items: [] });
    } catch (error) {
      log.error('Error clearing notifications:', error);
    }
  }, [userId]);

  const createNotification = useCallback(async (
    title: string,
    message: string,
    type: Notification['type'] = 'info',
    metadata: Json = {}
  ) => {
    if (!userId) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          title,
          message,
          type,
          metadata
        }]);

      if (error) throw error;
    } catch (error) {
      log.error('Error creating notification:', error);
    }
  }, [userId]);

  return {
    notifications,
    loading: visibleLoading,
    error,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    createNotification,
    refetch: fetchNotifications
  };
}
