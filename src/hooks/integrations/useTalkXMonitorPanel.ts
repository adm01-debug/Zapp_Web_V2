/**
 * X144 — painel do monitor lido do SERVIDOR (`talkx_monitor_panel`).
 *
 * Antes o monitor calculava tudo no navegador: KPIs vinham da linha da campanha,
 * o gráfico de ritmo de até 2.000 destinatários baixados a cada 5 s — teto fixo,
 * sem zero nos minutos vazios e contando "entregue" no minuto do envio. A conta
 * passa a ser uma só, no servidor (etapa X140, camada banco).
 *
 * Contrato da RPC (docs/talkx/v4/etapas/F11-acompanhar-campanha.md, X140):
 * `talkx_monitor_panel(p_campaign_id, p_window_minutes, p_bucket, p_day,
 * p_segment_id)` devolve UM jsonb com `kpis`, `vs_yesterday`, `forecast`,
 * `spark`, `series`, `reply_peak` e `health`. Os nomes de `health` e os campos
 * de `kpis`/`series` são os da RPC; este hook não inventa número nenhum: sem a
 * RPC aplicada no banco, `supabase.rpc` responde erro e a tela mostra o estado
 * de erro do kit com "Tentar de novo" (`isError`).
 *
 * `refetchInterval` é do chamador: com o canal ao vivo (X144,
 * `useTalkXLiveChannel`) quem atualiza é a invalidação do evento; no modo
 * degradado o painel passa a atualizar a cada 10 s.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// A RPC é da etapa X140 (migration da trilha de banco). O types-sync só gera a
// assinatura canônica depois que a migration chegar ao banco; até lá a chamada é
// tipada por este contrato local — mesmo padrão de `PendingDatabaseRpc` (useTalkX).
type PendingDatabaseRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/** Estado do worker no servidor (X140). */
export interface TalkXMonitorHealth {
  worker_state: string | null;
  last_activity_at: string | null;
  rate_per_minute: number | null;
  recommendation_code: string | null;
}

export interface TalkXMonitorPanelData {
  /** Um ponto por minuto ou por hora, com zeros (X140). */
  series: Record<string, unknown>[];
  health: TalkXMonitorHealth;
  kpis: Record<string, unknown>;
  vsYesterday: Record<string, unknown> | null;
  forecast: Record<string, unknown> | null;
  spark: Record<string, unknown> | null;
  replyPeak: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}

export interface TalkXMonitorPanelInput {
  campaignId: string | null | undefined;
  /** Janela da série, em minutos. */
  windowMinutes?: number;
  bucket?: 'minute' | 'hour';
  /** Dia (YYYY-MM-DD) para o recorte da campanha longa. */
  day?: string | null;
  segmentId?: string | null;
  /** `null` = sem polling (realtime cuida); número = ms (modo degradado). */
  refetchInterval?: number | null;
  enabled?: boolean;
}

export interface TalkXMonitorPanelResult {
  panel: TalkXMonitorPanelData | null;
  series: Record<string, unknown>[];
  health: TalkXMonitorHealth;
  kpis: Record<string, unknown>;
  vsYesterday: Record<string, unknown> | null;
  forecast: Record<string, unknown> | null;
  spark: Record<string, unknown> | null;
  replyPeak: Record<string, unknown> | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Traduz o jsonb da RPC para o contrato da tela, sem inventar campo ausente. */
export function monitorPanelFromServer(payload: unknown): TalkXMonitorPanelData {
  const raw = asRecord(payload) ?? {};
  const health = asRecord(raw.health) ?? {};
  const series = Array.isArray(raw.series)
    ? raw.series.map((point) => asRecord(point) ?? {}).filter((point) => Object.keys(point).length > 0)
    : [];

  return {
    series,
    health: {
      worker_state: asStringOrNull(health.worker_state),
      last_activity_at: asStringOrNull(health.last_activity_at),
      rate_per_minute: asNumberOrNull(health.rate_per_minute),
      recommendation_code: asStringOrNull(health.recommendation_code),
    },
    kpis: asRecord(raw.kpis) ?? {},
    vsYesterday: asRecord(raw.vs_yesterday),
    forecast: asRecord(raw.forecast),
    spark: asRecord(raw.spark),
    replyPeak: asRecord(raw.reply_peak),
    raw,
  };
}

const EMPTY_HEALTH: TalkXMonitorHealth = {
  worker_state: null,
  last_activity_at: null,
  rate_per_minute: null,
  recommendation_code: null,
};

export function useTalkXMonitorPanel({
  campaignId,
  windowMinutes = 60,
  bucket = 'minute',
  day = null,
  segmentId = null,
  refetchInterval = null,
  enabled = true,
}: TalkXMonitorPanelInput): TalkXMonitorPanelResult {
  const query = useQuery({
    queryKey: ['talkx-monitor-panel', campaignId, windowMinutes, bucket, day, segmentId],
    enabled: enabled && !!campaignId,
    refetchInterval: refetchInterval ?? false,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('talkx_monitor_panel', {
        p_campaign_id: campaignId,
        p_window_minutes: windowMinutes,
        p_bucket: bucket,
        p_day: day,
        p_segment_id: segmentId,
      });
      // Sem isto o erro da RPC viraria painel vazio (números zerados na tela).
      if (error) throw new Error(error.message);
      return monitorPanelFromServer(data);
    },
  });

  const panel = query.data ?? null;
  return {
    panel,
    series: panel?.series ?? [],
    health: panel?.health ?? EMPTY_HEALTH,
    kpis: panel?.kpis ?? {},
    vsYesterday: panel?.vsYesterday ?? null,
    forecast: panel?.forecast ?? null,
    spark: panel?.spark ?? null,
    replyPeak: panel?.replyPeak ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => { void query.refetch(); },
  };
}
