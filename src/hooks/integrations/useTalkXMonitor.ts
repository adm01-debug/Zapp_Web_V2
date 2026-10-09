import { useQuery } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';

export interface RatePoint { label: string; Enviadas: number; Entregues: number }

export interface MonitorRecipient {
  id: string;
  contact_id: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
}

/**
 * X144 — a leitura do ritmo tem JANELA de tempo, não teto de linhas.
 *
 * Antes eram as 2.000 linhas mais recentes da campanha (teto fixo): a série
 * dos últimos 60 min era montada em cima de uma amostra que, em campanha grande,
 * nem chegava ao minuto atual — e, quando chegava, o número era o de uma amostra
 * com cara de total. Agora o recorte é pelo `sent_at` da própria janela do
 * gráfico, então toda linha que pode cair num bucket da tela é lida; e
 * `truncated` avisa quando o servidor devolveu menos linhas do que existem na
 * janela (teto do PostgREST), para a tela não apresentar série parcial como
 * definitiva. A série por minuto passa a sair do servidor na etapa X140
 * (`talkx_monitor_panel.series`, via `useTalkXMonitorPanel`).
 */
export const MONITOR_WINDOW_MINUTES = 60;
export const MONITOR_WINDOW_MS = MONITOR_WINDOW_MINUTES * 60_000;

/** Início da janela em ISO — o mesmo recorte que `buildRateByMinute` desenha. */
export function monitorWindowStart(now: number = Date.now()): string {
  return new Date(now - MONITOR_WINDOW_MS).toISOString();
}

export function buildRateByMinute(data: { sent_at: string | null; delivered_at: string | null }[]): RatePoint[] {
  if (!data.length) return [];
  const now = Date.now();
  const windowMs = MONITOR_WINDOW_MS;
  const buckets = new Map<string, { sent: number; delivered: number }>();

  for (const r of data) {
    if (!r.sent_at) continue;
    const t = new Date(r.sent_at).getTime();
    if (now - t > windowMs) continue;
    const d = new Date(t);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const b = buckets.get(key) ?? { sent: 0, delivered: 0 };
    b.sent += 1;
    if (r.delivered_at) b.delivered += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { sent, delivered }]) => ({ label, Enviadas: sent, Entregues: delivered }));
}

export function useTalkXMonitor(campaignId: string | null, statusFilter = 'all') {
  const query = useQuery({
    queryKey: ['talkx-monitor-recipients', campaignId, statusFilter],
    queryFn: async () => {
      let q = fromTable('talkx_recipients')
        .select('id, contact_id, status, sent_at, delivered_at, error_message, personalized_message', { count: 'exact' })
        .eq('campaign_id', campaignId!)
        .gte('sent_at', monitorWindowStart())
        .order('sent_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data ?? []) as MonitorRecipient[];
      const total = typeof count === 'number' ? count : null;
      return { rows, total, truncated: total !== null && total > rows.length };
    },
    enabled: !!campaignId,
    refetchInterval: 5_000,
  });

  const rows = query.data?.rows ?? [];
  return {
    recipients: rows,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    rateByMinute: buildRateByMinute(rows),
    /** Quantas linhas existem na janela no servidor (null quando o servidor não informa). */
    total: query.data?.total ?? null,
    /** O servidor devolveu menos linhas do que existem na janela. */
    truncated: query.data?.truncated ?? false,
    windowMinutes: MONITOR_WINDOW_MINUTES,
    refetch: query.refetch,
  };
}
