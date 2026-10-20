/**
 * X144 — canal ÚNICO de tempo real por campanha, com modo degradado.
 *
 * Hoje cada bloco abre o próprio canal e nenhum trata falha de inscrição: o
 * Monitor tem `talkx-mon-<id>` (campanha + destinatários), a aba de logs da tela
 * 12 tem `talkx-logs-<id>` e uma rajada de eventos refaz as leituras uma a uma.
 * Quando o realtime cai, a tela fica parada mostrando "Ao vivo" — o selo é
 * escrito na mão (`LM:445`) sem olhar para o estado da inscrição.
 *
 * Este hook centraliza isso:
 *  - UM canal por campanha, com as três tabelas do acompanhamento
 *    (`talkx_campaigns`, `talkx_recipients`, `talkx_campaign_events`);
 *  - invalidação em LOTE: uma rajada de 50 eventos em 1 s gera UMA passagem de
 *    invalidação, e só das leituras DESTA campanha (nunca de outra);
 *  - estado explícito `live` / `degraded` / `offline`, com polling de 10 s no
 *    painel e 15 s na tabela quando o canal não está ao vivo, e reconexão em
 *    espera crescente (1 s, 2 s, 4 s… até 30 s).
 *
 * O tópico é exclusivo por instância (`uniqueRealtimeTopic`): desde a realtime-js
 * 2.101, `.on()` em canal já inscrito lança erro — nome fixo montado em dois
 * blocos ao mesmo tempo derrubaria a tela.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

export type TalkXLiveStatus = 'connecting' | 'live' | 'degraded' | 'offline';

/** Polling do painel (KPIs/série) enquanto o canal não está ao vivo. */
export const TALKX_DEGRADED_PANEL_MS = 10_000;
/** Polling da tabela de destinatários enquanto o canal não está ao vivo. */
export const TALKX_DEGRADED_TABLE_MS = 15_000;
/** Janela do lote de invalidação: no máximo UMA passagem por segundo. */
export const TALKX_INVALIDATE_WINDOW_MS = 1_000;
/** Espera crescente entre tentativas de reconexão (ms). */
export const TALKX_RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export interface TalkXLiveChannelResult {
  status: TalkXLiveStatus;
  /** Canal inscrito: as leituras chegam por evento, sem polling. */
  live: boolean;
  /** Inscrição falhou (erro/timeout): polling ligado e reconexão em espera crescente. */
  degraded: boolean;
  /** Canal fechado sem termos pedido: as leituras continuam, só não em tempo real. */
  offline: boolean;
  /** Intervalo de atualização do painel, em ms; `null` quando ao vivo. */
  panelPollMs: number | null;
  /** Intervalo de atualização da tabela de destinatários, em ms; `null` quando ao vivo. */
  tablePollMs: number | null;
}

/**
 * Raízes das leituras que o canal atualiza. Lista fechada de propósito: invalidar
 * "tudo" a cada UPDATE de destinatário recarregaria telas que o evento não muda
 * (entrega/leitura não altera KPIs de outras campanhas nem templates).
 */
const TALKX_LIVE_KEY_ROOTS = new Set<string>([
  'talkx-campaign-live',
  'talkx-monitor-panel',
  'talkx-recipients-page',
  'talkx-campaign-timeline',
  'talkx-segment-progress',
  'talkx-recipients-monitor',
  'talkx-running-recipients',
  'talkx-running-messages',
  'talkx-running-logs',
  'talkx-events',
]);

/** A chave pertence às leituras desta campanha? (usada pelo filtro de invalidação) */
export function isTalkXLiveQueryKey(queryKey: QueryKey, campaignId: string): boolean {
  if (!Array.isArray(queryKey)) return false;
  const [root, keyedCampaign] = queryKey;
  return typeof root === 'string' && TALKX_LIVE_KEY_ROOTS.has(root) && keyedCampaign === campaignId;
}

/** Espera da próxima tentativa; a última posição repete (teto de 30 s). */
export function reconnectDelayMs(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1), TALKX_RECONNECT_BACKOFF_MS.length) - 1;
  return TALKX_RECONNECT_BACKOFF_MS[index];
}

export function useTalkXLiveChannel(campaignId: string | null | undefined): TalkXLiveChannelResult {
  const queryClient = useQueryClient();
  // O status pertence a UMA campanha: enquanto a inscrição da campanha aberta não
  // respondeu, o estado efetivo é `connecting` (e `offline` sem campanha). É
  // derivado no render — o efeito só escreve quando o sistema EXTERNO (a inscrição)
  // muda de estado, nunca no corpo do efeito.
  const [subscription, setSubscription] = useState<{ campaignId: string | null; status: TalkXLiveStatus }>({
    campaignId: null,
    status: 'connecting',
  });
  const status: TalkXLiveStatus = !campaignId
    ? 'offline'
    : subscription.campaignId === campaignId
      ? subscription.status
      : 'connecting';
  const pendingFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!campaignId) return;

    let disposed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // UMA passagem de invalidação por janela, e só das leituras desta campanha.
    const scheduleInvalidate = () => {
      if (disposed || pendingFlushRef.current !== null) return;
      pendingFlushRef.current = setTimeout(() => {
        pendingFlushRef.current = null;
        if (disposed) return;
        void queryClient.invalidateQueries({
          predicate: (query) => isTalkXLiveQueryKey(query.queryKey, campaignId),
        });
      }, TALKX_INVALIDATE_WINDOW_MS);
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      attempt += 1;
      const delay = reconnectDelayMs(attempt);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      const previous = channel;
      channel = null;
      if (previous) void supabase.removeChannel(previous);
      const nextChannel = supabase
        .channel(uniqueRealtimeTopic(`talkx-live-${campaignId}`));
      channel = nextChannel;
      const scheduleInvalidateForChannel = () => {
        if (channel !== nextChannel) return;
        scheduleInvalidate();
      };
      nextChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'talkx_campaigns', filter: `id=eq.${campaignId}` }, scheduleInvalidateForChannel)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'talkx_recipients', filter: `campaign_id=eq.${campaignId}` }, scheduleInvalidateForChannel)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'talkx_campaign_events', filter: `campaign_id=eq.${campaignId}` }, scheduleInvalidateForChannel)
        .subscribe((subscribeStatus) => {
          if (disposed || channel !== nextChannel) return;
          if (subscribeStatus === 'SUBSCRIBED') {
            attempt = 0;
            setSubscription({ campaignId, status: 'live' });
            return;
          }
          if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
            // Sem tempo real a tela não pode parar: cai para polling e tenta de novo.
            setSubscription({ campaignId, status: 'degraded' });
            scheduleReconnect();
            return;
          }
          if (subscribeStatus === 'CLOSED') {
            setSubscription({ campaignId, status: 'offline' });
            scheduleReconnect();
          }
        });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pendingFlushRef.current) {
        clearTimeout(pendingFlushRef.current);
        pendingFlushRef.current = null;
      }
      if (channel) void supabase.removeChannel(channel);
    };
  }, [campaignId, queryClient]);

  const live = status === 'live';
  return {
    status,
    live,
    degraded: status === 'degraded',
    offline: status === 'offline',
    panelPollMs: live ? null : TALKX_DEGRADED_PANEL_MS,
    tablePollMs: live ? null : TALKX_DEGRADED_TABLE_MS,
  };
}

/** Texto do SELO ÚNICO de tempo real (a tela não escreve o texto à mão). */
export function talkxLiveBadgeText(status: TalkXLiveStatus): string {
  if (status === 'live') return 'Ao vivo';
  if (status === 'connecting') return 'Conectando…';
  return 'Tempo real indisponível — painel a cada 10 s, tabela a cada 15 s';
}
