import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { useCRMAdminAccess } from '@/hooks/crm/useCRMAdminAccess';
import { useActiveDepartments } from '@/hooks/team-chat/useActiveDepartments';
import { fromTable } from '@/lib/supabaseHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { BarChart3, TrendingUp, Users, CheckCircle2, Target, Calendar, Zap, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { IconTile, KpiCard, KpiCardSkeleton, TalkXEmptyState, TalkXErrorState, TalkXSkeletonRows, InsightCard, fmtDateTime, fmtInt, fmtPct } from './talkxShared';
import { TalkXQueryBoundary } from './kit/states';
import { useTalkXInsights } from '@/hooks/integrations/useTalkXInsights';
import { useTalkXAnalytics, variacaoPct, variacaoPontos, ANALYTICS_REFETCH_MS } from '@/hooks/integrations/useTalkXAnalytics';
import { AnalyticsPerformanceChart } from './analytics/AnalyticsPerformanceChart';
import type { PerformancePeriod, PerformancePoint } from './analytics/AnalyticsPerformanceChart';
import { AnalyticsFunnel } from './analytics/AnalyticsFunnel';
import type { FunnelStep } from './analytics/AnalyticsFunnel';
import { CHART_TICK_FONT_SIZE, CHART_TICK_FONT_SIZE_SM, CHART_TOOLTIP_FONT_SIZE, CHART_LABEL_FONT_SIZE } from '@/lib/chart-theme';
import {
  ANALYTICS_FILTER_DEFAULTS, AUDIENCE_OPTIONS, CHANNEL_OPTIONS,
  PERIOD_LABELS, PERIOD_ORDER, fmtBRL, isValidAnalyticsDepartmentId, pctTexto, readAnalyticsFilters, resolveAnalyticsRange, writeAnalyticsFilters,
  type AnalyticsCompareRow, type AnalyticsFilterValues, type AnalyticsPeriod,
} from './talkxAnalyticsFilters';

interface Props { campaigns: TalkXCampaign[]; isLoading?: boolean; isError?: boolean }

// X185 — barra de filtros do Analytics: o estado, a URL, o intervalo do período e o
// validação vivem em ./talkxAnalyticsFilters (módulo .ts, sem componente).
type Period = AnalyticsPeriod;
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PERFORMANCE_DAYS: Record<PerformancePeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };

function toPerformancePeriod(period: Period): PerformancePeriod {
  return period === '7d' || period === '30d' || period === '90d' ? period : '30d';
}

export function TalkXAnalytics({ campaigns, isLoading, isError }: Props) {
  // X186: seletor PRÓPRIO do gráfico de performance. `null` = ainda não foi tocado, então
  // ele segue o filtro da tela quando o período é 7/30/90 dias; em mês/customizado,
  // mantém 30 dias porque o gráfico só aceita estes três atalhos.
  const [chartPeriod, setChartPeriod] = useState<PerformancePeriod | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null); // E74
  const [pageLoadTime] = useState<number>(() => Date.now());
  // X185: os filtros da barra. A URL guarda o recorte para sobreviver ao recarregamento.
  const [filters, setFilters] = useState<AnalyticsFilterValues>(() => (
    typeof window === 'undefined' ? ANALYTICS_FILTER_DEFAULTS : readAnalyticsFilters(window.location.search)
  ));

  const setFilter = useCallback((patch: Partial<AnalyticsFilterValues>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      writeAnalyticsFilters(next);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    const next = { ...ANALYTICS_FILTER_DEFAULTS };
    setFilters(next);
    writeAnalyticsFilters(next);
  }, []);


  const period = filters.period;
  // O intervalo é derivado UMA vez por mudança de filtro (nada de `new Date()` a
  // cada render, que faria a consulta do resumo mudar de chave sozinha).
  const range = useMemo(() => resolveAnalyticsRange(filters), [filters]);
  const cutoff = range.from;
  const filtersActive = useMemo(
    () => (Object.keys(ANALYTICS_FILTER_DEFAULTS) as (keyof AnalyticsFilterValues)[])
      .some((k) => filters[k] !== ANALYTICS_FILTER_DEFAULTS[k]),
    [filters],
  );
  const filtered = useMemo(() => campaigns.filter((c) => c.started_at && new Date(c.started_at) >= cutoff), [campaigns, cutoff]);

  // Equipe é filtro de admin/supervisor; sem esse papel a lista nem é consultada
  // e nenhum valor vindo da URL é enviado para a RPC.
  const canFilterTeam = useCRMAdminAccess() === true;
  const { data: departments } = useActiveDepartments(canFilterTeam);
  const effectiveDepartmentId = canFilterTeam && isValidAnalyticsDepartmentId(filters.departmentId)
    ? filters.departmentId
    : 'all';

  // X185: os cinco KPIs e o comparativo saem da RPC `talkx_overview_stats` com os
  // filtros da barra. A reconsulta de 60 s só roda com campanha em `sending`.
  const hasSending = campaigns.some((c) => c.status === 'sending');
  const {
    data: analytics, isPending: analyticsPending, isError: analyticsError, refetch: refetchAnalytics,
  } = useTalkXAnalytics({
    from: range.from,
    to: range.to,
    channel: filters.channel,
    audienceSource: filters.audienceSource,
    departmentId: effectiveDepartmentId,
  }, { live: hasSending });

  // X185: card "Comparativo de períodos" no rail — seletor próprio; por padrão ele
  // segue o período da barra (mesma chave de consulta, sem chamada extra).
  const [comparePeriod, setComparePeriod] = useState<Period | null>(null);
  const effectiveComparePeriod = comparePeriod ?? period;
  const compareRange = useMemo(
    () => resolveAnalyticsRange({ ...filters, period: effectiveComparePeriod }),
    [filters, effectiveComparePeriod],
  );
  const {
    data: compareStats, isError: compareError, refetch: refetchCompare,
  } = useTalkXAnalytics({
    from: compareRange.from,
    to: compareRange.to,
    channel: filters.channel,
    audienceSource: filters.audienceSource,
    departmentId: effectiveDepartmentId,
  }, { live: hasSending });
  const compareRows = useMemo<AnalyticsCompareRow[]>(() => {
    const cur = compareStats?.current ?? null;
    const prev = compareStats?.previous ?? null;
    return [
      {
        label: 'Campanhas enviadas',
        atual: cur ? fmtInt(cur.campaigns_sent) : '—',
        anterior: prev ? fmtInt(prev.campaigns_sent) : '—',
        variacao: variacaoPct(cur?.campaigns_sent, prev?.campaigns_sent),
      },
      {
        label: 'Taxa de resposta',
        atual: pctTexto(cur?.reply_rate_pct),
        anterior: pctTexto(prev?.reply_rate_pct),
        variacao: variacaoPontos(cur?.reply_rate_pct, prev?.reply_rate_pct),
      },
      {
        label: 'Receita influenciada',
        atual: fmtBRL(cur?.revenue) ?? '—',
        anterior: fmtBRL(prev?.revenue) ?? '—',
        variacao: variacaoPct(cur?.revenue, prev?.revenue),
      },
    ];
  }, [compareStats]);

  const stats = useMemo(() => {
    const sent = filtered.reduce((a, c) => a + c.sent_count, 0);
    const failed = filtered.reduce((a, c) => a + c.failed_count, 0);
    const delivered = filtered.reduce((a, c) => a + c.delivered_count, 0);
    const read = filtered.reduce((a, c) => a + (c.read_count ?? 0), 0);
    const outcomeUnknown = filtered.reduce((a, c) => a + (c.outcome_unknown_count ?? 0), 0);
    const total = sent + failed + outcomeUnknown;
    return { sent, failed, delivered, read, outcomeUnknown, total, successRate: total > 0 ? Math.round((sent / total) * 1000) / 10 : 0 };
  }, [filtered]);

  const { data: hourlyData } = useQuery({
    queryKey: ['talkx-hourly-stats', period],
    queryFn: async () => {
      const { data } = await fromTable('talkx_recipients')
        .select('sent_at, status').in('status', ['sent', 'delivered'])
        .gte('sent_at', cutoff.toISOString()).not('sent_at', 'is', null);
      const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      const hourTotals: number[] = Array(24).fill(0);
      (data ?? []).forEach((r: { sent_at?: string | null }) => {
        if (!r.sent_at) return;
        const d = new Date(r.sent_at); const h = d.getHours(); const dw = d.getDay();
        heatmap[dw][h] += 1; hourTotals[h] += 1;
      });
      return { heatmap, hourTotals };
    },
    staleTime: 60_000,
  });

  // E76: o resumo por segmento virou o KPI "Conversão por segmento" (X185), lido da
  // RPC; o ranking de segmentos é da etapa X187.

  // X185: os cartões do topo e o comparativo de períodos usam o resumo da RPC.
  // A taxa de resposta não é mais recalculada no navegador (janela de 24 h,
  // só `status='sent'`, teto de 5.000) — vem de `reply_rate_pct` do servidor.
  const current = analytics?.current ?? null;
  const previous = analytics?.previous ?? null;
  const dailyBars = useMemo(() => (analytics?.daily ?? []).map((d) => d.sent), [analytics]);
  const repliedTotal = current?.replied ?? 0;

  // E74: recipients do painel lateral
  const { data: panelRecipients, isLoading: panelLoading } = useQuery({
    queryKey: ['talkx-campaign-detail', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const { data } = await fromTable('talkx_recipients')
        .select('status, sent_at, delivered_at, error_message, contacts:contact_id(name, phone)')
        .eq('campaign_id', selectedCampaignId).order('created_at', { ascending: false }).limit(200);
      return (data ?? []) as Array<{
        status: string; sent_at: string | null; delivered_at: string | null;
        error_message: string | null; contacts: { name: string; phone: string } | null;
      }>;
    },
    enabled: !!selectedCampaignId,
    staleTime: 60_000,
  });
  const panelCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const topCampaigns = useMemo(() => [...filtered].sort((a, b) => b.sent_count - a.sent_count).slice(0, 5), [filtered]);

  // X186: degraus do funil da campanha. Conversão por mensagem ainda não é medida pela
  // plataforma (etapa de banco X073): a fonte entra como `null` e a tela mostra "sem dados
  // ainda" — nunca um zero que não foi medido (A9).
  const funnelSteps = useMemo<FunnelStep[]>(() => ([
    { key: 'sent', label: 'Enviadas', value: stats.sent, token: 'primary' },
    { key: 'delivered', label: 'Entregues', value: stats.delivered, token: 'dash-green' },
    { key: 'read', label: 'Lidas', value: stats.read, token: 'teal' },
    { key: 'replied', label: 'Respostas', value: repliedTotal, token: 'violeta' },
    { key: 'conversions', label: 'Conversões', value: null, token: 'rosa' },
  ]), [stats, repliedTotal]);

  // X186: série diária do gráfico de performance. O período é o do seletor próprio do
  // gráfico; por padrão acompanha a barra quando ela usa 7/30/90 dias.
  const effectiveChartPeriod: PerformancePeriod = chartPeriod ?? toPerformancePeriod(period);
  const chartCutoff = useMemo(
    () => new Date(pageLoadTime - PERFORMANCE_DAYS[effectiveChartPeriod] * 86_400_000),
    [pageLoadTime, effectiveChartPeriod],
  );
  const { data: performancePoints, isLoading: performanceLoading, isError: performanceError } = useQuery({
    queryKey: ['talkx-performance-daily', effectiveChartPeriod],
    queryFn: async () => {
      // Recusa 1 do TL-171: o `error` da RPC NÃO pode ser descartado. Quando ele vem, a
      // leitura falhou: lançar aqui faz o React Query marcar `isError` e o gráfico mostra o
      // estado de erro próprio ("Não foi possível carregar a série do período"), nunca o
      // vazio "Sem envios registrados" — que afirmaria leitura OK com zero envio.
      const { data, error } = await supabase.rpc('talkx_overview_stats', {
        p_from: chartCutoff.toISOString(),
        p_to: new Date(pageLoadTime).toISOString(),
      });
      if (error) throw error;
      // `daily` é contada no servidor pelos carimbos de envio, entrega e resposta.
      // `conversions` só passa a existir depois da etapa de banco X073: enquanto o campo
      // não vier, a série fica nula (o gráfico mostra "sem dados ainda"), nunca zero.
      const daily = (data as unknown as { daily?: Array<Record<string, unknown>> } | null)?.daily ?? [];
      return daily.map((row): PerformancePoint => ({
        day: String(row.day ?? ''),
        sent: typeof row.sent === 'number' ? row.sent : null,
        delivered: typeof row.delivered === 'number' ? row.delivered : null,
        replied: typeof row.replied === 'number' ? row.replied : null,
        conversions: typeof row.conversions === 'number' ? row.conversions : null,
      }));
    },
    staleTime: 60_000,
  });
  const heatmaxVal = useMemo(() => Math.max(...(hourlyData?.hourTotals ?? [0]), 1), [hourlyData]);

  // Por dia da semana: soma de todas as horas de cada dia
  const dayTotals = useMemo(() => DAY_LABELS.map((day, dw) => ({
    name: day,
    Envios: hourlyData ? hourlyData.heatmap[dw].reduce((a: number, b: number) => a + b, 0) : 0,
  })), [hourlyData]);

  // Melhor horário: pico no hourTotals
  const bestHour = useMemo(() => {
    const totals = hourlyData?.hourTotals ?? [];
    const max = Math.max(...totals, 0);
    if (max === 0) return null;
    const h = totals.indexOf(max);
    const bestDay = hourlyData ? hourlyData.heatmap.reduce((best, row, dw) => row[h] > best.count ? { dw, count: row[h] } : best, { dw: -1, count: 0 }) : null;
    return { hour: h, day: bestDay && bestDay.dw >= 0 ? DAY_LABELS[bestDay.dw] : null, count: max };
  }, [hourlyData]);

  // E94: insights heurísticos — hook SEMPRE antes do return antecipado (regra dos
  // hooks); chamar depois dele causava "Rendered more hooks" quando a lista ia de
  // 0 para 1 campanha.
  const { data: insights } = useTalkXInsights();

  // X047: os tres returns antecipados (erro, carga, vazio) saem; o boundary decide na ordem
  // carregando -> erro -> vazio -> conteudo, com o erro tendo precedencia sobre o vazio.
  if (isError || isLoading || campaigns.length === 0) {
    return (
      <TalkXQueryBoundary
        query={{ isLoading, isError }}
        entity="as analytics"
        skeleton={<TalkXSkeletonRows rows={6} />}
        isEmpty={campaigns.length === 0}
        empty={<TalkXEmptyState icon={BarChart3} title="Nenhuma campanha para analisar" description="Execute pelo menos uma campanha para ver os analytics." />}
      >
        <></>
      </TalkXQueryBoundary>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        {/* X185: barra de filtros — 4 cartões-seletor + "Limpar filtros". O recorte
            fica na URL para sobreviver ao recarregamento. */}
        <div className={cn('grid grid-cols-2 gap-3', canFilterTeam ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
          <div className="rounded-xl border border-border/70 bg-card p-3">
            <label htmlFor="txa-periodo" className="text-3xs font-medium text-muted-foreground uppercase tracking-wide">Período</label>
            <select id="txa-periodo" aria-label="Período" value={filters.period}
              onChange={(e) => setFilter({ period: e.target.value as Period })}
              className="mt-1 w-full h-9 px-2 rounded-lg text-xs bg-input/40 border border-border/70 text-foreground">
              {PERIOD_ORDER.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
            </select>
            {filters.period === 'custom' && (
              <div className="mt-2 flex items-center gap-1.5">
                <input type="date" aria-label="De" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })}
                  className="h-8 min-w-0 flex-1 px-1.5 rounded-lg text-2xs bg-input/40 border border-border/70 text-foreground" />
                <span className="text-3xs text-muted-foreground">até</span>
                <input type="date" aria-label="Até" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })}
                  className="h-8 min-w-0 flex-1 px-1.5 rounded-lg text-2xs bg-input/40 border border-border/70 text-foreground" />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-3">
            <label htmlFor="txa-canal" className="text-3xs font-medium text-muted-foreground uppercase tracking-wide">Canal</label>
            <select id="txa-canal" aria-label="Canal" value={filters.channel}
              onChange={(e) => setFilter({ channel: e.target.value })}
              className="mt-1 w-full h-9 px-2 rounded-lg text-xs bg-input/40 border border-border/70 text-foreground">
              {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-3">
            <label htmlFor="txa-origem" className="text-3xs font-medium text-muted-foreground uppercase tracking-wide">Origem do público</label>
            <select id="txa-origem" aria-label="Origem do público" value={filters.audienceSource}
              onChange={(e) => setFilter({ audienceSource: e.target.value })}
              className="mt-1 w-full h-9 px-2 rounded-lg text-xs bg-input/40 border border-border/70 text-foreground">
              {AUDIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Equipe: só admin/supervisor recebe a lista de departamentos. */}
          {canFilterTeam && (
            <div className="rounded-xl border border-border/70 bg-card p-3">
              <label htmlFor="txa-equipe" className="text-3xs font-medium text-muted-foreground uppercase tracking-wide">Equipe</label>
              <select id="txa-equipe" aria-label="Equipe" value={filters.departmentId}
                onChange={(e) => setFilter({ departmentId: e.target.value })}
                className="mt-1 w-full h-9 px-2 rounded-lg text-xs bg-input/40 border border-border/70 text-foreground">
                <option value="all">Todas as equipes</option>
                {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs text-muted-foreground">
            {hasSending
              ? `Atualizando a cada ${Math.round(ANALYTICS_REFETCH_MS / 1000)} s — há campanha em envio`
              : 'Sem campanha em envio: os números só mudam quando você atualiza'}
          </p>
          <button type="button" onClick={clearFilters} disabled={!filtersActive}
            className="h-9 px-3 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 motion-safe:transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
            Limpar filtros
          </button>
        </div>

      {/* X185: cinco KPIs lidos da RPC, com variação contra o período anterior. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
        {analyticsError && !current ? (
          // Erro do servidor não é "sem dados": a tela diz que falhou e oferece retentar.
          <div className="col-span-full">
            <TalkXErrorState entity="estatísticas do período" onRetry={() => { void refetchAnalytics(); }} />
          </div>
        ) : analyticsPending && !current ? (
          Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard icon={Zap} color="blue" index={0} label="Campanhas enviadas"
              value={current ? current.campaigns_sent : null}
              hint={current ? `${fmtInt(current.sent)} mensagens enviadas no período` : undefined}
              bars={dailyBars}
              comparison={{ previous: previous?.campaigns_sent ?? null, kind: 'relative' }} />
            <KpiCard icon={CheckCircle2} color="green" index={1} label="Taxa de entrega"
              value={current ? current.delivery_rate_pct : null}
              hint={current ? `${fmtInt(current.failed)} falhas · ${fmtInt(current.delivered)} de ${fmtInt(current.sent)} entregues` : undefined}
              comparison={{ previous: previous?.delivery_rate_pct ?? null, kind: 'points' }} />
            <KpiCard icon={Users} color="violet" index={2} label="Taxa de resposta"
              value={current ? current.reply_rate_pct : null}
              hint={current ? `${fmtInt(current.replied)} respostas em ${fmtInt(current.sent)} envios` : undefined}
              comparison={{ previous: previous?.reply_rate_pct ?? null, kind: 'points' }} />
            <KpiCard icon={Target} color="amber" index={3} label="Conversão por segmento"
              value={current ? current.segment_conversion_rate_pct ?? null : null}
              hint="Conversões sobre enviadas, só de destinatários com segmento"
              comparison={{ previous: previous?.segment_conversion_rate_pct ?? null, kind: 'points' }} />
            <KpiCard icon={TrendingUp} color="green" index={4} label="Receita influenciada"
              value={current?.revenue ?? null}
              hint={current?.revenue == null ? 'Receita atribuída às conversões das campanhas do período' : fmtBRL(current.revenue) ?? undefined}
              comparison={{ previous: previous?.revenue ?? null, kind: 'relative' }} />
          </>
        )}
      </div>

      {/* E75: respondentes agora derivam do servidor (V18); a segmentação
          individual de respondentes deixa de ser consultada aqui. */}

      {/* X186: performance no tempo (4 séries) e funil em SVG proporcional. Os dois
          substituem o gráfico de barras "Performance por Campanha" e o funil de larguras
          fixas (100/80/55/35 %), que não media a perda real entre os degraus. */}
      <AnalyticsPerformanceChart
        data={performancePoints ?? []}
        period={effectiveChartPeriod}
        onPeriodChange={setChartPeriod}
        isLoading={performanceLoading}
        isError={performanceError}
      />

      <AnalyticsFunnel steps={funnelSteps} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Barra por dia da semana */}
        <section className="rounded-2xl bg-card border border-border/70 p-4">
          <div className="flex items-center gap-2 mb-4">
            <IconTile icon={BarChart3} color="amber" size={36} />
            <div><p className="text-[15px] font-bold text-foreground">Volume por dia da semana</p><p className="text-xs text-foreground-secondary">Total de envios por dia</p></div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dayTotals} margin={{ top: 4, right: 4, left: -25, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: CHART_TICK_FONT_SIZE_SM }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: CHART_TICK_FONT_SIZE }} stroke="hsl(var(--muted-foreground))" />
              <ReTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: CHART_TOOLTIP_FONT_SIZE }} />
              <Bar dataKey="Envios" radius={[4, 4, 0, 0]}>
                {dayTotals.map((entry) => {
                  const max = Math.max(...dayTotals.map((d) => d.Envios), 1);
                  const intensity = entry.Envios / max;
                  return <Cell key={entry.name} fill={`hsl(var(--primary) / ${0.3 + intensity * 0.7})`} />;
                })}
                <LabelList dataKey="Envios" position="top" style={{ fontSize: CHART_LABEL_FONT_SIZE, fill: 'hsl(var(--muted-foreground))' }} formatter={(v) => (typeof v === 'number' && v > 0 ? String(v) : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* Card de insight: melhor horário */}
        <section className="rounded-2xl bg-card border border-border/70 p-4 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <IconTile icon={Sparkles} color="violet" size={36} />
            <div><p className="text-[15px] font-bold text-foreground">Melhor horário de envio</p><p className="text-xs text-foreground-secondary">Pico de envios no período</p></div>
          </div>
          {bestHour ? (
            <div className="text-center py-4">
              <p className="text-5xl font-bold text-foreground tabular-nums leading-none">{String(bestHour.hour).padStart(2, '0')}h</p>
              {bestHour.day && <p className="text-sm text-foreground-secondary mt-1">{bestHour.day} &mdash; {bestHour.count} envios</p>}
              <p className="text-2xs text-muted-foreground mt-3 leading-snug">Maior volume de envios da amostra. Não mede abertura — referência de agenda, não de resultado.</p>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground text-center py-6">Sem dados de envio no período selecionado.</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl bg-card border border-border/70 p-4">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <IconTile icon={Calendar} color="green" size={36} />
            <div><p className="text-[15px] font-bold text-foreground">Melhores horários de envio</p><p className="text-xs text-foreground-secondary">Volume por dia da semana e horário</p></div>
          </div>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span className="w-8 h-2.5 rounded-sm bg-muted/50 inline-block" />Menor
            <span className="w-8 h-2.5 rounded-sm bg-primary/80 inline-block" />Maior
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="flex ml-9 mb-1">{Array.from({ length: 8 }, (_, i) => i * 3).map((h) => <div key={h} className="flex-1 text-[9px] text-muted-foreground text-center">{String(h).padStart(2, '0')}h</div>)}</div>
            {DAY_LABELS.map((day, dw) => (
              <div key={day} className="flex items-center mb-0.5 gap-1">
                <span className="text-3xs text-foreground-secondary w-8 text-right shrink-0">{day}</span>
                <div className="flex-1 flex gap-0.5">
                  {Array.from({ length: 24 }, (_, h) => {
                    const count = hourlyData?.heatmap[dw][h] ?? 0;
                    const intensity = count / heatmaxVal;
                    return <div key={h} title={`${day} ${String(h).padStart(2,'0')}h: ${count} envios`} className="flex-1 h-5 rounded-[2px]" style={{ background: intensity > 0 ? `hsl(var(--primary) / ${Math.max(0.1, intensity * 0.9)})` : 'hsl(var(--muted) / 0.3)' }} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {topCampaigns.length > 0 && (
        <section className="rounded-2xl bg-card border border-border/70 p-4">
          <p className="text-[15px] font-bold text-foreground mb-3">Campanhas com melhor resultado</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr>
                {['#','Campanha','Canal','Enviadas','Taxa de entrega','Falhas'].map((h) => <th key={h} className="text-left text-2xs font-semibold text-foreground-secondary px-3 py-2">{h}</th>)}
              </tr></thead>
              <tbody>
                {topCampaigns.map((c, i) => (
                  <tr key={c.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5"><button type="button" onClick={() => setSelectedCampaignId((prev) => prev === c.id ? null : c.id)} className="text-left hover:text-primary transition-colors"><p className="text-[13px] font-semibold text-foreground truncate max-w-[240px]">{c.name}</p></button></td>
                    <td className="px-3 py-2.5"><span className="text-xs text-whatsapp">WhatsApp</span></td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-foreground">{fmtInt(c.sent_count)}</td>
                    <td className="px-3 py-2.5 text-[13px] text-dash-green font-semibold">{c.sent_count > 0 ? fmtPct(c.delivered_count, c.sent_count) : '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] text-foreground-secondary">{c.failed_count > 0 ? fmtInt(c.failed_count) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {/* E74: painel de detalhe por campanha */}
      {selectedCampaignId && (
        <section className="rounded-2xl bg-card border border-border/70 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <IconTile icon={BarChart3} color="blue" size={36} />
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-foreground truncate max-w-[360px]">{panelCampaign?.name ?? 'Campanha'}</p>
                <p className="text-xs text-foreground-secondary">{panelLoading ? 'Carregando…' : `${panelRecipients?.length ?? 0} destinatários (amostra)`}</p>
              </div>
            </div>
            <button type="button" onClick={() => setSelectedCampaignId(null)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium hover:bg-muted/50">Fechar</button>
          </div>
          {panelCampaign && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {([['Enviadas', fmtInt(panelCampaign.sent_count), 'text-primary'], ['Entregues', fmtInt(panelCampaign.delivered_count), 'text-dash-green'], ['Falhas', fmtInt(panelCampaign.failed_count), 'text-dash-red']] as [string, string, string][]).map(([label, value, color]) => (
                <div key={label} className="rounded-xl border border-border/60 bg-input/20 p-3 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-2xs text-foreground-secondary mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}
          {panelLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 bg-muted/40 rounded-lg animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse">
                <thead><tr>
                  {([['Contato', '180px'], ['Telefone', '130px'], ['Status', '80px'], ['Enviada em', '130px'], ['Entregue em', '130px']] as [string, string][]).map(([h, w]) => (
                    <th key={h} style={{ minWidth: w }} className="text-left text-2xs font-semibold text-foreground-secondary px-2 py-2">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(panelRecipients ?? []).map((r, i) => {
                    const tone = r.status === 'sent' ? 'text-dash-green' : r.status === 'failed' ? 'text-dash-red' : 'text-foreground-secondary';
                    return (
                      <tr key={i} className="border-t border-border/40 hover:bg-muted/10">
                        <td className="px-2 py-2 text-xs font-medium text-foreground truncate max-w-[180px]">{r.contacts?.name ?? '—'}</td>
                        <td className="px-2 py-2 text-xs text-foreground-secondary font-mono">{r.contacts?.phone ?? '—'}</td>
                        <td className={`px-2 py-2 text-xs font-semibold ${tone}`}>{r.status || '—'}</td>
                        <td className="px-2 py-2 text-2xs text-muted-foreground">{r.sent_at ? fmtDateTime(r.sent_at) : '—'}</td>
                        <td className="px-2 py-2 text-2xs text-muted-foreground">{r.delivered_at ? fmtDateTime(r.delivered_at) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(panelRecipients?.length ?? 0) >= 200 && <p className="text-2xs text-muted-foreground text-center mt-2">Exibindo primeiros 200 registros.</p>}
            </div>
          )}
        </section>
      )}

        </div>
        <div className="space-y-4 min-w-0">
          {/* X185: comparativo de PERÍODOS no rail, com seletor próprio. Três linhas
              (campanhas enviadas, taxa de resposta, receita) em 2 colunas e variação. */}
          <section className="rounded-2xl bg-card border border-border/70 p-4 space-y-3" data-testid="comparativo-periodos">
            <div className="flex items-center gap-2">
              <IconTile icon={TrendingUp} color="violet" size={36} />
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-foreground">Comparativo de períodos</p>
                <p className="text-xs text-foreground-secondary">Atual contra o período anterior</p>
              </div>
            </div>
            <select aria-label="Período do comparativo" value={effectiveComparePeriod}
              onChange={(e) => setComparePeriod(e.target.value as Period)}
              className="w-full h-9 px-2 rounded-lg text-xs bg-input/40 border border-border/70 text-foreground">
              {PERIOD_ORDER.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
            </select>
            <div className="space-y-2">
              {compareError && !compareStats ? (
                <TalkXErrorState entity="estatísticas do comparativo" onRetry={() => { void refetchCompare(); }} />
              ) : compareRows.map((row) => (
                <div key={row.label} className="grid grid-cols-2 gap-2 items-center rounded-lg border border-border/60 bg-input/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-2xs text-foreground-secondary">{row.label}</p>
                    <p className="text-[13px] font-semibold text-foreground tabular-nums truncate">{row.atual}</p>
                  </div>
                  <div className="text-right">
                    {row.variacao
                      ? <span className={cn('text-2xs font-semibold tabular-nums', row.variacao.startsWith('-') ? 'text-destructive' : 'text-success')}>{row.variacao}</span>
                      : <span className="text-2xs text-muted-foreground">sem comparação</span>}
                    <p className="text-3xs text-muted-foreground tabular-nums">antes: {row.anterior}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* E94: Insights heurísticos */}
          {insights && insights.length > 0 && (
            <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Insights</h3>
          </div>
          <div className="space-y-2">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                type={insight.type}
                title={insight.title}
                description={insight.description}
                priority={insight.priority}
                applyLabel={insight.applyLabel}
                onApply={insight.apply}
              />
            ))}
          </div>
        </section>
      )}
        </div>
    </div>
  );
}
