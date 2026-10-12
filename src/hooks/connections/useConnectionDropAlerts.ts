import { useEffect, useRef } from 'react';
import { toast } from '@/hooks/ui/use-toast';
import { showBrowserNotification } from '@/utils/notificationSounds';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useUserRole } from '@/hooks/system/useUserRole';
import {
  connectionsHealthStore,
  useConnectionsHealth,
  type ConnectionsHealthStore,
  type DisconnectEvent,
} from './useConnectionsHealth';

/**
 * Aviso GLOBAL de queda de conexão do WhatsApp.
 *
 * O GL1 (`useConnectionsHealth`) já detecta a transição conectada → fora do ar e guarda o
 * histórico da sessão; o que faltava era AVISAR quem não está com a tela de Monitoramento
 * aberta — o `useMonitoringNotifications` só roda dentro dela. Este hook vive no nível do app
 * (montado em `AppProviders`), lê o MESMO store global (não abre outra assinatura de realtime) e
 * dispara toast + notificação do navegador para qualquer tela.
 *
 * Só staff (admin/supervisor) é avisado: agente não gerencia conexão. O aviso respeita a
 * preferência do painel (`browser_notifications_enabled`) e o horário de silêncio — a Edge de
 * "canal e-mail" não existe nesta base; quando a PD-38/39 entrar, o ponto de extensão é o
 * `allowBrowser` abaixo.
 *
 * Dedupe: a MESMA conexão só vira aviso uma vez a cada `DROP_ALERT_DEDUP_MS`. A janela é medida
 * no `at` do evento (o mesmo relógio do store), então dois eventos do mesmo instante também não
 * repetem — não depende de relógio de parede nem re-render.
 */

/** Janela de agrupamento por conexão: quedas repetidas em 5 min viram um aviso só. */
export const DROP_ALERT_DEDUP_MS = 5 * 60 * 1000;

export interface DropAlertGate {
  /** true se este evento (conexão + instante) deve virar aviso; false se caiu na janela. */
  shouldNotify(connectionId: string, at: number): boolean;
}

export function createDropAlertGate(dedupMs: number = DROP_ALERT_DEDUP_MS): DropAlertGate {
  const lastNotifiedAt = new Map<string, number>();
  return {
    shouldNotify(connectionId, at) {
      const previous = lastNotifiedAt.get(connectionId);
      // `at <= previous` conta como repetido: evento fora de ordem ou o mesmo evento relido
      // numa nova renderização não deve reabrir a janela.
      if (previous !== undefined && at - previous < dedupMs) return false;
      lastNotifiedAt.set(connectionId, at);
      return true;
    },
  };
}

/** Rótulo humano da conexão: nome, senão instância, senão o id. */
export function connectionDropLabel(event: DisconnectEvent): string {
  return event.name || event.instanceId || event.connectionId;
}

export interface ConnectionDropAlertsOptions {
  /** Store de saúde (injetável para testes). Default: store global compartilhado. */
  store?: ConnectionsHealthStore;
}

export function useConnectionDropAlerts(options: ConnectionDropAlertsOptions = {}): void {
  const store = options.store ?? connectionsHealthStore;
  const { history } = useConnectionsHealth(store);
  const { settings, isQuietHours } = useNotificationSettings();
  const { isSupervisor } = useUserRole();

  // A janela do dedupe vive num ref: sobrevive a re-render e a dupla invocação de efeito,
  // sem reabrir no remount de um StrictMode.
  const gateRef = useRef<DropAlertGate | null>(null);
  if (gateRef.current === null) gateRef.current = createDropAlertGate();

  const allowBrowser = settings.browserNotifications && !isQuietHours();

  useEffect(() => {
    // Papel e preferência são as dependências do efeito: quando eles chegam DEPOIS do evento
    // (papel carregando, preferência recém-ativada), o efeito roda de novo e o evento ainda no
    // histórico é anunciado — sem perder a queda nem duplicar (a janela cuida do duplicado).
    if (!isSupervisor) return;
    if (!allowBrowser) return;
    const gate = gateRef.current;
    if (!gate) return;

    for (const event of history) {
      if (!gate.shouldNotify(event.connectionId, event.at)) continue;
      const label = connectionDropLabel(event);
      toast({
        title: 'Conexão perdida',
        description: `A conexão "${label}" saiu do ar. Mensagens não serão enviadas nem recebidas.`,
        variant: 'destructive',
      });
      // Mesmo `tag` do `useMonitoringNotifications` (dc-<instância>): se a tela de Monitoramento
      // estiver aberta e avisar a mesma queda, o navegador substitui a notificação em vez de
      // empilhar duas iguais.
      showBrowserNotification('Conexão perdida', `Instância ${label} saiu do ar.`, {
        tag: `dc-${event.instanceId ?? event.connectionId}`,
      });
    }
  }, [history, isSupervisor, allowBrowser]);
}
