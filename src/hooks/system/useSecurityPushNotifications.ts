import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { usePushNotifications } from '@/hooks/system/usePushNotifications';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  is_resolved: boolean | null;
}

export function useSecurityPushNotifications() {
  const { user } = useAuth();
  const { isSubscribed, permission, showNotification } = usePushNotifications();

  const sendSecurityNotification = useCallback(async (alert: SecurityAlert) => {
    if (permission !== 'granted' || !isSubscribed) {
      log.debug('Push notifications not available, using toast fallback');
      
      // Fallback to toast notification
      const toastType = alert.severity === 'high' || alert.severity === 'critical' 
        ? 'error' 
        : alert.severity === 'medium' 
          ? 'warning' 
          : 'info';

      if (toastType === 'error') {
        toast.error(alert.title, { description: alert.description || undefined });
      } else if (toastType === 'warning') {
        toast.warning(alert.title, { description: alert.description || undefined });
      } else {
        toast.info(alert.title, { description: alert.description || undefined });
      }
      return;
    }

    // Determine notification urgency
    const isUrgent = alert.severity === 'high' || alert.severity === 'critical';

    // Format the body with details
    let body = alert.description || 'Alerta de segurança detectado';
    if (alert.ip_address) {
      body += ` (IP: ${alert.ip_address})`;
    }

    // Show push notification
    await showNotification({
      title: `🔐 ${alert.title}`,
      body,
      tag: `security-${alert.id}`,
      requireInteraction: isUrgent,
      data: {
        alertId: alert.id,
        alertType: alert.alert_type,
        severity: alert.severity,
        category: 'security',
      },
      vibrate: isUrgent ? [300, 100, 300, 100, 300] : [200, 100, 200],
    });

    log.debug('Security notification sent:', alert.title);
  }, [permission, isSubscribed, showNotification]);

  // E62: security_alerts removida da publicação realtime (migration 20260905).
  // Polling de 20s com filtro por user_id e timestamp de último check.
  const lastCheckedRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    if (!user) return;

    log.debug('Setting up security alerts polling for user:', user.id);

    const interval = setInterval(async () => {
      const { data, error } = await supabase
        .from('security_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_resolved', false)
        .gt('created_at', lastCheckedRef.current)
        .order('created_at', { ascending: true });

      if (error) { log.debug('Security alerts poll error:', error); return; }
      lastCheckedRef.current = new Date().toISOString();

      for (const alert of (data ?? []) as SecurityAlert[]) {
        log.debug('New security alert via polling:', alert);
        sendSecurityNotification(alert);
      }
    }, 20_000);

    return () => {
      log.debug('Cleaning up security alerts polling');
      clearInterval(interval);
    };
  }, [user, sendSecurityNotification]);

  // Listen for service worker messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      log.debug('Message from service worker:', event.data);

      if (event.data.type === 'SECURITY_ACTION') {
        // Navigate to security view or take action
        toast.info('Redirecionando para Central de Segurança...');
        // Could dispatch a navigation event here
      }

      if (event.data.type === 'NOTIFICATION_CLICK' && event.data.data?.category === 'security') {
        toast.info('Abrindo detalhes do alerta...');
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, []);

  return {
    sendSecurityNotification,
    isEnabled: isSubscribed && permission === 'granted',
  };
}
