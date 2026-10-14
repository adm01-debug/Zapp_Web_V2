import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { PUSH_NOTIFICATIONS_ENABLED } from '@/config/service_worker';

/**
 * Alertas do navegador (Notification local), NÃO push de servidor.
 *
 * O Zapp Web não tem Service Worker de aplicação (SERVICE_WORKER_ENABLED=false) e não
 * mantém servidor de push (VAPID/endpoint/assinatura no banco). O que este hook liga é
 * apenas o alerta local do próprio navegador, que só aparece com o Zapp aberto — por isso
 * não existe mais assinatura push criada, enviada ou registrada em log.
 */
interface NotificationState {
  isSupported: boolean;
  permission: NotificationPermission;
  isActive: boolean;
  isLoading: boolean;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
}

export function usePushNotifications() {
  const [state, setState] = useState<NotificationState>({
    isSupported: false,
    permission: 'default',
    isActive: false,
    isLoading: true,
  });

  useEffect(() => {
    const checkSupport = () => {
      // Sem Service Worker de aplicação e sem PushManager: só a API de Notification
      // local do navegador é exigida.
      const isSupported = PUSH_NOTIFICATIONS_ENABLED &&
                          'Notification' in window &&
                          'serviceWorker' in navigator;

      if (!isSupported) {
        setState(prev => ({ ...prev, isSupported: false, isLoading: false }));
        return;
      }

      setState({
        isSupported: true,
        permission: Notification.permission,
        isActive: false,
        isLoading: false,
      });
    };

    void checkSupport();
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      toast.error('Alertas do navegador estão desativados nesta versão');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));

      if (permission === 'granted') {
        toast.success('Permissão concedida para alertas do navegador!');
        return true;
      } else if (permission === 'denied') {
        toast.error('Permissão negada. Você pode alterar nas configurações do navegador.');
        return false;
      }
      return false;
    } catch (error) {
      log.error('Error requesting permission:', error);
      toast.error('Erro ao solicitar permissão');
      return false;
    }
  }, [state.isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) return false;

    try {
      if (state.permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) return false;
      }

      setState(prev => ({ ...prev, isActive: true }));
      toast.success('Alertas com o navegador aberto ativados!');
      return true;
    } catch (error) {
      log.error('Error enabling browser alerts:', error);
      toast.error('Erro ao ativar alertas do navegador');
      return false;
    }
  }, [state.isSupported, state.permission, requestPermission]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) return false;
    if (!state.isActive) return false;

    setState(prev => ({ ...prev, isActive: false }));
    toast.success('Alertas com o navegador aberto desativados');
    return true;
  }, [state.isSupported, state.isActive]);

  const showNotification = useCallback(async (payload: NotificationPayload): Promise<boolean> => {
    if (!state.isSupported || state.permission !== 'granted') {
      log.warn('Notification permission not granted');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      const options: NotificationOptions = {
        body: payload.body,
        icon: payload.icon || '/favicon.ico',
        badge: payload.badge || '/favicon.ico',
        tag: payload.tag,
        data: payload.data,
        requireInteraction: payload.requireInteraction ?? false,
        silent: payload.silent ?? false,
      };

      await registration.showNotification(payload.title, options);

      return true;
    } catch (error) {
      log.error('Error showing notification:', error);
      return false;
    }
  }, [state.isSupported, state.permission]);

  const toggleSubscription = useCallback(async () => {
    if (state.isActive) {
      return unsubscribe();
    } else {
      return subscribe();
    }
  }, [state.isActive, subscribe, unsubscribe]);

  return {
    isSupported: state.isSupported,
    permission: state.permission,
    // `isSubscribed` mantido para os consumidores existentes: agora significa
    // "alertas do navegador ligados", não "assinatura push registrada".
    isSubscribed: state.isActive,
    isLoading: state.isLoading,
    isEnabled: PUSH_NOTIFICATIONS_ENABLED,
    requestPermission,
    subscribe,
    unsubscribe,
    showNotification,
    toggleSubscription,
  };
}
