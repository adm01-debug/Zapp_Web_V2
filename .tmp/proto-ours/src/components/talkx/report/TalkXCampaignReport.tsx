import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ExternalLink, FileBarChart2, Lightbulb } from 'lucide-react';

import { fromTable, supabase } from '@/lib/supabaseHelpers';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { IconTile, MetaRow, RailCard, TalkXQueryBoundary, TalkXSkeletonRows, fmtDurationShort, fmtInt, type TalkXQueryLike } from '../talkxShared';
import { TalkXReportFunnel } from './TalkXReportFunnel';
import { TalkXReportHeatmap } from './TalkXReportHeatmap';
import { TalkXReportPerformance } from './TalkXReportPerformance';
import {
  REPORT_SAMPLE_LIMIT,
  talkxReportHeatmapFromTimestamps,
  talkxReportSeriesFromRows,
  type TalkXReportRecipientRow,
} from './talkxReportData';
import type {
  TalkXReportFunnelStep,
  TalkXReportGranularity,
  TalkXReportHeatmapMetric,
} from './talkxReportCharts';

/**
 * X164 / TL-080 — "Relatório" de uma campanha concluída (tela 14).
 *
 * Esta é a tela que MONTA os três cartões órfãos do `report/` (Desempenho, Funil e
 * Mapa de Calor). Ela é a única que fala com o banco: lê o RPC
 * `talkx_campaign_report` (resumo de 8 KPIs) e as linhas reais de
 * `talkx_recipients` / `talkx_link_clicks` para montar série e mapa de calor.
 *
 * Fonte de cada número:
 * - Resumo/8 KPIs  → RPC `talkx_campaign_report` (kpis), contando a campanha inteira;
 * - Funil          → kpis (enviados/entregues) + `replied_count` da campanha +
 *                    cliques reais; "Converteram" fica nulo (não há fonte de conversão);
 * - Desempenho     → amostra real dos destinatários (até REPORT_SAMPLE_LIMIT), no
 *                    fuso da campanha; "Conversões" não é desenhada (sem fonte);
 * - Mapa de Calor  → mesmos timestamps (envios/respostas) ou cliques, no fuso da campanha.
 *
 * Fuso: `talkx_campaigns.schedule_timezone`; sem ele, cai em America/Sao_Paulo (o
 * fuso de agendamento padrão do produto) — NUNCA no fuso de quem abre a tela.
 */

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

interface TalkXCampaignReportKpis {
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  outcome_unknown_count: number;
  delivery_rate_pct: number;
  duration_secs: number;
}

interface TalkXCampaignReportPayload {
  kpis: TalkXCampaignReportKpis | null;
}

interface ClickRow {
  clicked_at: string | null;
  talkx_links: { campaign_id: string | null } | null;
}

export interface TalkXCampaignReportProps {
  campaign: TalkXCampaign;
  /** Mapa profiles.id -> nome (do `useTeamProfiles` da tela mãe) para o "Responsável". */
  creators?: Record<string, string>;
  onBack: () => void;
  /** Abre o Monitor da MESMA campanha sem perder esta tela. */
  onViewMonitor?: (id: string) => void;
}

export function TalkXCampaignReport({ campaign, creators, onBack, onViewMonitor }: TalkXCampaignReportProps) {
  const timeZone = campaign.schedule_timezone || DEFAULT_TIMEZONE;
  const [granularity, setGranularity] = useState<TalkXReportGranularity>('day');
  const [heatmapMetric, setHeatmapMetric] = useState<TalkXReportHeatmapMetric>('replied');

  const reportQuery = useQuery({
    queryKey: ['talkx-campaign-report', campaign.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('talkx_campaign_report', { p_campaign: campaign.id });
      if (error) throw error;
      return (data ?? null) as unknown as TalkXCampaignReportPayload | null;
    },
    staleTime: 60_000,
  });

  const recipientsQuery = useQuery({
    queryKey: ['talkx-report-recipients', campaign.id],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_recipients')
        .select('sent_at, delivered_at, replied_at')
        .eq('campaign_id', campaign.id)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: true })
        .limit(REPORT_SAMPLE_LIMIT);
      if (error) throw error;
      return (data ?? []) as TalkXReportRecipientRow[];
    },
    staleTime: 60_000,
  });

  const clicksQuery = useQuery({
    queryKey: ['talkx-report-clicks', campaign.id],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_link_clicks')
        .select('clicked_at, talkx_links!inner(campaign_id)')
        .eq('talkx_links.campaign_id', campaign.id)
        .order('clicked_at', { ascending: true })
        .limit(REPORT_SAMPLE_LIMIT);
      if (error) throw error;
      // Filtro defensivo no cliente: nunca atribuir a esta campanha um clique de outra.
      return ((data ?? []) as ClickRow[])
        .filter((row) => row.talkx_links?.campaign_id === campaign.id)
        .map((row) => row.clicked_at);
    },
    staleTime: 60_000,
  });

  const kpis = reportQuery.data?.kpis ?? null;
  const recipients = useMemo(() => recipientsQuery.data ?? [], [recipientsQuery.data]);
  const clicks = useMemo(() => clicksQuery.data ?? [], [clicksQuery.data]);
  const sampleTruncated = recipients.length >= REPORT_SAMPLE_LIMIT;

  const series = useMemo(
    () => talkxReportSeriesFromRows(recipients, granularity, timeZone),
    [recipients, granularity, timeZone],
  );

  const heatmap = useMemo(() => {
    if (heatmapMetric === 'clicked') return talkxReportHeatmapFromTimestamps(clicks, timeZone);
    const key = heatmapMetric === 'sent' ? 'sent_at' : 'replied_at';
    return talkxReportHeatmapFromTimestamps(recipients.map((row) => row[key]), timeZone);
  }, [heatmapMetric, recipients, clicks, timeZone]);

  const funnelSteps = useMemo<TalkXReportFunnelStep[]>(() => {
    const sent = kpis?.sent_count ?? campaign.sent_count;
    const delivered = kpis?.delivered_count ?? campaign.delivered_count;
    const hasClicksData = clicksQuery.isSuccess;
    return [
      { key: 'sent', count: sent },
      { key: 'delivered', count: delivered },
      { key: 'replied', count: campaign.replied_count ?? 0 },
      { key: 'clicked', count: hasClicksData ? clicks.length : null },
      { key: 'converted', count: null },
    ];
  }, [kpis, campaign, clicks.length, clicksQuery.isSuccess]);

  const handleGranularity = useCallback((next: TalkXReportGranularity) => setGranularity(next), []);
  const handleMetric = useCallback((next: TalkXReportHeatmapMetric) => setHeatmapMetric(next), []);

  const boundaryQuery: TalkXQueryLike = {
    isLoading: reportQuery.isLoading,
    isFetching: reportQuery.isFetching,
    isError: reportQuery.isError,
    error: reportQuery.error,
  };

  const durationText = kpis ? fmtDurationShort(kpis.duration_secs) : '—';
  const kpiCards: { label: string; value: string; hint?: string }[] = kpis
    ? [
        { label: 'Destinatários', value: fmtInt(kpis.total_recipients) },
        { label: 'Enviados', value: fmtInt(kpis.sent_count) },
        { label: 'Entregues', value: fmtInt(kpis.delivered_count), hint: `${String(kpis.delivery_rate_pct).replace('.', ',')}% dos enviados` },
        { label: 'Respostas', value: fmtInt(campaign.replied_count ?? 0) },
        { label: 'Lidas', value: fmtInt(kpis.read_count) },
        { label: 'Falhas', value: fmtInt(kpis.failed_count) },
        { label: 'A confirmar', value: fmtInt(kpis.outcome_unknown_count) },
        { label: 'Duração', value: durationText },
      ]
    : [];

  return (
    <div className="min-h-full w-full min-w-0 bg-background p-3 md:p-4 lg:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} aria-label="Voltar" className="p-1.5 rounded-lg hover:bg-muted/50 shrink-0">
            <ChevronLeft className="w-5 h-5 text-foreground-secondary" />
          </button>
          <IconTile icon={FileBarChart2} color="violet" size={40} glow />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground leading-tight truncate">Relatório da Campanha</h1>
            <p className="text-xs text-foreground-secondary truncate">{campaign.name}</p>
          </div>
        </div>
        {onViewMonitor && (
          <button
            type="button"
            onClick={() => onViewMonitor(campaign.id)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50 shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir Monitor
          </button>
        )}
      </div>

      <TalkXQueryBoundary
        query={boundaryQuery}
        entity="dados do relatório"
        onRetry={() => { void reportQuery.refetch(); }}
        skeleton={<div className="rounded-2xl border border-border/50 bg-card p-4"><TalkXSkeletonRows rows={5} /></div>}
        isEmpty={!kpis}
        empty={<div className="rounded-2xl border border-border/50 bg-muted/20 p-10 text-center"><p className="text-sm text-foreground-secondary">Sem dados de resumo para esta campanha.</p></div>}
      >
        <>
          <RailCard title="Resumo da Campanha" subtitle={campaign.objective ? `Objetivo: ${campaign.objective}` : 'Números consolidados da campanha'} color="blue" icon={FileBarChart2}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {kpiCards.map(({ label, value, hint }) => (
                <div key={label} className="rounded-xl border border-border/60 bg-input/20 p-3">
                  <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
                  <p className="text-2xs font-semibold text-foreground-secondary mt-0.5">{label}</p>
                  {hint && <p className="text-3xs text-muted-foreground mt-0.5">{hint}</p>}
                </div>
              ))}
            </div>
            <div className="pt-1">
              {campaign.template_id && <MetaRow label="Template" value={campaign.template_id} />}
              {campaign.owner && creators?.[campaign.owner] && <MetaRow label="Responsável" value={creators[campaign.owner]} />}
              <MetaRow label="Fuso do relatório" value={timeZone} />
            </div>
          </RailCard>

          {sampleTruncated && (
            <p className="text-2xs text-muted-foreground">
              {`Desempenho e mapa de calor usam uma amostra de ${fmtInt(REPORT_SAMPLE_LIMIT)} envios mais antigos desta campanha.`}
            </p>
          )}

          <TalkXReportPerformance
            series={series}
            granularity={granularity}
            onGranularityChange={handleGranularity}
            timeZone={timeZone}
            hasConversionSource={false}
          />

          <TalkXReportFunnel steps={funnelSteps} segments={[]} segmentId={null} onSegmentChange={() => {}} />

          <TalkXReportHeatmap matrix={heatmap} metric={heatmapMetric} onMetricChange={handleMetric} />

          <section className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2">
              <IconTile icon={Lightbulb} color="amber" size={36} />
              <div>
                <p className="text-[15px] font-bold text-foreground">Insights</p>
                <p className="text-xs text-foreground-secondary">Análise heurística da conta</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-foreground-secondary">
              Os insights heurísticos ainda são calculados para a CONTA inteira (janela de 90 dias), não por campanha —
              por isso não são exibidos aqui para não misturar duas campanhas no mesmo relatório.
            </p>
          </section>
        </>
      </TalkXQueryBoundary>
    </div>
  );
}
