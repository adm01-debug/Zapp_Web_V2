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
 * Só staff (admin/supervisor) é avisado: agente não gerencia conexão.
 *
 * Canais SEPARADOS (o cartão pede toast E notificação do navegador):
 * - o toast dentro do app sai para staff sempre, e só o horário de silêncio o cala;
 * - `settings.browserNotifications` (preferência `browser_notifications_enabled` do painel)
 *   regula SÓ `showBrowserNotification`; o ponto de extensão para a PD-38/39 (canal e-mail)
 *   é o `allowBrowser` abaixo.
 *
 * Sem rajada atrasada: cada evento do histórico é marcado como visto (`connectionId + at`)
 * na PRIMEIRA passada do efeito — anunciado ou suprimido, ele nunca volta. O ÚNICO caso de
 * reapresentação é o evento que chegou enquanto o papel ainda carregava (`!isSupervisor`
 * retorna cedo sem marcar nada). Suprimido por silêncio ou preferência, velho demais
 * (`>= DROP_ALERT_DEDUP_MS`) ou de conexão que já voltou (`healthy` no snapshot atual):
 * some em silêncio e não reaparece quando o efeito volta a rodar.
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
  /** Relógio para medir a idade do evento (injetável para testes). Default: Date.now. */
  now?: () => number;
}

/** Chave do "visto": o mesmo evento nunca é avaliado duas vezes. */
function dropEventKey(event: DisconnectEvent): string {
  return `${event.connectionId}\n${event.at}`;
}

export function useConnectionDropAlerts(options: ConnectionDropAlertsOptions = {}): void {
  const store = options.store ?? connectionsHealthStore;
  const now = options.now ?? Date.now;
  const { history, connections } = useConnectionsHealth(store);
  const { settings, isQuietHours } = useNotificationSettings();
  const { isSupervisor } = useUserRole();

  // A janela do dedupe vive num ref: sobrevive a re-render e a dupla invocação de efeito,
  // sem reabrir no remount de um StrictMode.
  const gateRef = useRef<DropAlertGate | null>(null);
  if (gateRef.current === null) gateRef.current = createDropAlertGate();
  // Eventos já processados (anunciados OU suprimidos de propósito). O histórico é memória
  // da sessão e o efeito volta a rodar quando papel, preferência ou silêncio mudam — sem
  // esta marca, uma queda suprimida ontem viraria rajada atrasada hoje.
  const seenRef = useRef<Set<string> | null>(null);
  if (seenRef.current === null) seenRef.current = new Set<string>();

  useEffect(() => {
    // Papel ainda carregando (ou agente): sai cedo SEM marcar nada como visto. O evento
    // retido aqui é reapresentado quando o papel resolver staff — o único caso de
    // reapresentação. Para agente o efeito nunca anuncia, então nada se perde.
    if (!isSupervisor) return;
    const gate = gateRef.current;
    const seen = seenRef.current;
    if (!gate || !seen) return;

    const quiet = isQuietHours();
    const allowBrowser = settings.browserNotifications && !quiet;

    for (const event of history) {
      const key = dropEventKey(event);
      if (seen.has(key)) continue;
      // Marca ANTES de decidir: suprimido por silêncio, preferência, idade ou reconexão
      // também não volta — nunca vira rajada atrasada.
      seen.add(key);
      // O silêncio cala os DOIS canais (toast + navegador).
      if (quiet) continue;
      // Queda velha (mais antiga que a janela): não é anunciada.
      if (now() - event.at >= DROP_ALERT_DEDUP_MS) continue;
      // A conexão já voltou: o snapshot atual diz 'connected'.
      if (connections.some((connection) => connection.id === event.connectionId && connection.healthy)) {
        continue;
      }
      if (!gate.shouldNotify(event.connectionId, event.at)) continue;
      const label = connectionDropLabel(event);
      toast({
        title: 'Conexão perdida',
        description: `A conexão "${label}" saiu do ar. Mensagens não serão enviadas nem recebidas.`,
        variant: 'destructive',
      });
      // A preferência do navegador regula SÓ o navegador: o toast dentro do app continua.
      // Mesmo `tag` do `useMonitoringNotifications` (dc-<instância>): se a tela de Monitoramento
      // estiver aberta e avisar a mesma queda, o navegador substitui a notificação em vez de
      // empilhar duas iguais.
      if (allowBrowser) {
        showBrowserNotification('Conexão perdida', `Instância ${label} saiu do ar.`, {
          tag: `dc-${event.instanceId ?? event.connectionId}`,
        });
      }
    }
  }, [history, connections, isSupervisor, settings.browserNotifications, isQuietHours, now]);
}
