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

const POLL_INTERVAL_MS = 20_000;

/**
 * Cursor do polling: `created_at` do ÚLTIMO alerta recebido, com o `id` como
 * desempate. Os dois valores vêm do SERVIDOR — o relógio do navegador não entra
 * no cursor. É isso que faz um relógio atrasado não repetir alerta e um
 * adiantado não pular alerta. O `id` fecha o caso de dois alertas gravados no
 * mesmo instante na fronteira da janela: sem ele o segundo cairia fora do `gt`
 * de `created_at` e nunca seria avisado.
 */
interface SecurityAlertsCursor {
  createdAt: string;
  id: string;
}

/**
 * Estado do laço de polling de UM usuário, compartilhado por todos os pontos de
 * montagem (o listener global no topo do app e a Central de Segurança, que
 * também chama este hook). Duas consequências, as duas testadas:
 *  - uma consulta por ciclo, não uma por ponto de montagem;
 *  - um aviso por alerta, não um por ponto de montagem.
 * O laço vive enquanto houver interessado e morre com o último (`refs`).
 */
interface SecurityAlertsPoller {
  refs: number;
  interval: ReturnType<typeof setInterval>;
  swHandler: ((event: MessageEvent) => void) | null;
  /** `null` = ainda sem linha de base (nada recebido ainda). */
  cursor: SecurityAlertsCursor | null;
  seeded: boolean;
  inFlight: boolean;
  notify: (alert: SecurityAlert) => void;
}

const pollers = new Map<string, SecurityAlertsPoller>();

function handleServiceWorkerMessage(event: MessageEvent) {
  log.debug('Message from service worker:', event.data);

  if (event.data.type === 'SECURITY_ACTION') {
    // A Central de Segurança NÃO é aberta daqui: este ponto de montagem vive
    // fora do Router (é overlay do `App`), então não há `navigate` disponível —
    // item 3 do achado HZ1-10 (clicar no push abre a Central) segue aberto. O
    // texto é o mesmo de antes deste cartão.
    toast.info('Redirecionando para Central de Segurança...');
  }

  if (event.data.type === 'NOTIFICATION_CLICK' && event.data.data?.category === 'security') {
    toast.info('Abrindo detalhes do alerta...');
  }
}

/**
 * Um ciclo: primeiro a LINHA DE BASE (não avisa nada), depois só o que veio
 * depois do cursor. A linha de base é o alerta mais recente que já existe para
 * o usuário, lido no relógio do servidor — sem ela, o primeiro ciclo repetiria
 * todo o histórico do usuário como se fosse novo.
 */
async function pollSecurityAlerts(userId: string, state: SecurityAlertsPoller) {
  if (state.inFlight) return;
  state.inFlight = true;

  try {
    if (!state.seeded) {
      const { data, error } = await supabase
        .from('security_alerts')
        .select('id, created_at')
        .eq('user_id', userId)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);

      if (error) { log.debug('Security alerts poll error:', error); return; }

      const maisRecente = ((data ?? []) as Array<{ id: string; created_at: string }>)[0];
      state.cursor = maisRecente
        ? { createdAt: maisRecente.created_at, id: maisRecente.id }
        : null;
      state.seeded = true;
      return;
    }

    const base = supabase
      .from('security_alerts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_resolved', false);

    // Cursor composto: `created_at` maior, ou o `id` maior quando o instante
    // empata. As duas colunas ordenadas na mesma direção do cursor.
    const consulta = state.cursor
      ? base.or(
          `created_at.gt.${state.cursor.createdAt},and(created_at.eq.${state.cursor.createdAt},id.gt.${state.cursor.id})`,
        )
      : base;

    const { data, error } = await consulta
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) { log.debug('Security alerts poll error:', error); return; }

    for (const alert of (data ?? []) as SecurityAlert[]) {
      // Avança o cursor por último recebido — o relógio do navegador não entra.
      state.cursor = { createdAt: alert.created_at, id: alert.id };
      log.debug('New security alert via polling:', alert);
      state.notify(alert);
    }
  } finally {
    state.inFlight = false;
  }
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

  // O laço lê o enviador pelo ref: trocar de permissão não reinicia o polling
  // (reiniciar perderia o cursor) e o laço continua válido depois que o ponto
  // de montagem que o criou sair.
  const senderRef = useRef(sendSecurityNotification);
  // A troca do enviador passa por EFEITO: escrever ref durante a renderização é
  // o que o lint `react-hooks/refs` recusa (e o efeito roda antes do laço).
  useEffect(() => {
    senderRef.current = sendSecurityNotification;
  }, [sendSecurityNotification]);

  // E62: security_alerts removida da publicação realtime (migration 20260905).
  // Polling de 20s com filtro por user_id e cursor pelo último alerta recebido.
  useEffect(() => {
    if (!user) return;

    log.debug('Setting up security alerts polling for user:', user.id);

    let state = pollers.get(user.id);
    if (!state) {
      state = {
        refs: 0,
        interval: setInterval(() => { void pollSecurityAlerts(user.id, state!); }, POLL_INTERVAL_MS),
        swHandler: null,
        cursor: null,
        seeded: false,
        inFlight: false,
        notify: () => {},
      };
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        state.swHandler = handleServiceWorkerMessage;
      }
      pollers.set(user.id, state);
      // Linha de base já na montagem: sem ela o primeiro ciclo só rodaria 20s
      // depois e os alertas criados nesse meio-tempo se perderiam.
      void pollSecurityAlerts(user.id, state);
    }

    state.refs += 1;
    state.notify = (alert) => { void senderRef.current(alert); };
    const atual = state;

    return () => {
      log.debug('Cleaning up security alerts polling');
      atual.refs -= 1;
      if (atual.refs > 0) return;

      clearInterval(atual.interval);
      if (atual.swHandler && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', atual.swHandler);
      }
      pollers.delete(user.id);
    };
  }, [user]);

  return {
    sendSecurityNotification,
    isEnabled: isSubscribed && permission === 'granted',
  };
}
