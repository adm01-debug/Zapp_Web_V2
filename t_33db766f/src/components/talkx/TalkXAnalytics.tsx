import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTalkXSegments } from '@/hooks/integrations/useTalkXSegments';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { BarChart3, TrendingUp, Users, CheckCircle2, XCircle, Target, Calendar, Zap, Sparkles } from 'lucide-react';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { Database } from '@/integrations/supabase/types';
import { IconTile, TalkXEmptyState, TalkXErrorState, TalkXSkeletonRows, InsightCard, barsByDay, fmtDateTime, fmtInt, fmtPct, pct } from './talkxShared';
import { TalkXQueryBoundary } from './kit/states';
import { useTalkXInsights } from '@/hooks/integrations/useTalkXInsights';
import { CHART_TICK_FONT_SIZE, CHART_TICK_FONT_SIZE_SM, CHART_TOOLTIP_FONT_SIZE, CHART_LABEL_FONT_SIZE } from '@/lib/chart-theme';

interface Props { campaigns: TalkXCampaign[]; isLoading?: boolean; isError?: boolean }
type Period = '7d' | '30d' | '90d';
const PERIOD_LABELS: Record<Period, string> = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias' };
const DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 };
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function TalkXAnalytics({ campaigns, isLoading, isError }: Props) {
  const [period, setPeriod] = useState<Period>('30d');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null); // E74
  const days = DAYS[period];
  // pageLoadTime captured once via lazy init (outside render); cutoff derived stably
  const [pageLoadTime] = useState<number>(() => Date.now());
  const cutoff = useMemo(() => new Date(pageLoadTime - days * 86_400_000), [pageLoadTime, days]);
  const filtered = useMemo(() => campaigns.filter((c) => c.started_at && new Date(c.started_at) >= cutoff), [campaigns, cutoff]);

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

  // E73: taxa de resposta real
  const sentCampaignIds = useMemo(
    () => filtered.filter((c) => c.status === 'completed' || c.status === 'sending').map((c) => c.id),
    [filtered]
  );

  // E76: analytics por segmento
  const { segments: allSegments } = useTalkXSegments();
  const top3Segments = useMemo(() => {
    const map = new Map<string, { name: string; sent: number; total: number }>();
    filtered.forEach((c) => {
      if (!c.segment_id) return;
      const existing = map.get(c.segment_id);
      const name = allSegments?.find((sg) => sg.id === c.segment_id)?.name ?? c.segment_id.slice(0, 8);
      map.set(c.segment_id, {
        name,
        sent: (existing?.sent ?? 0) + (c.sent_count ?? 0),
        total: (existing?.total ?? 0) + (c.total_recipients ?? 0),
      });
    });
    return [...map.values()]
      .filter((sg) => sg.total > 0)
      .map((sg) => ({ ...sg, rate: Math.round((sg.sent / sg.total) * 1000) / 10 }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3);
  }, [filtered, allSegments]);

  // V18: taxa de resposta calculada no servidor (replied_count / sent_count),
  // sem re-query de talkx_recipients/messages no cliente.
  const repliedTotal = filtered.reduce((a, c) => a + (c.replied_count ?? 0), 0);
  const sentTotal = filtered.reduce((a, c) => a + c.sent_count, 0);
  const replyRate = sentTotal > 0
    ? Math.round((repliedTotal / sentTotal) * 1000) / 10 : null;

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
  const barData = useMemo(() => topCampaigns.map((c) => ({ name: c.name.slice(0, 18) + (c.name.length > 18 ? '…' : ''), Enviadas: c.sent_count, Falhas: c.failed_count })), [topCampaigns]);

  // E82: comparativo taxa de entrega
  // E82: usa campaigns (nao filtered) — periodo nao deve excluir campanhas antigas do comparativo
  // Envio (%) = sent_count/total_recipients (dado rastreado; delivered aguarda E87)
  const compareData = useMemo(() => {
    const comp = campaigns
      .filter((c) => c.status === 'completed' && c.total_recipients > 0)
      .sort((a, b) => new Date(b.completed_at ?? b.updated_at).getTime() - new Date(a.completed_at ?? a.updated_at).getTime())
      .slice(0, 5)
      .map((c) => ({
        name: c.name.length > 16 ? c.name.slice(0, 15) + '…' : c.name,
        'Envio (%)': c.total_recipients > 0 ? Math.round((c.sent_count / c.total_recipients) * 1000) / 10 : 0,
        'Falha (%)': (c.sent_count + c.failed_count) > 0 ? Math.round((c.failed_count / (c.sent_count + c.failed_count)) * 1000) / 10 : 0,
      }))
      .reverse();
    return comp;
  }, [campaigns]);
  const funnelData = useMemo(() => {
    return [
      { name: 'Enviadas', value: stats.sent, reported: true, fill: 'hsl(var(--primary))' },
      { name: 'Entregues', value: stats.delivered, reported: true, fill: 'hsl(var(--dash-green))' },
      { name: 'Lidas', value: stats.read, reported: true, fill: 'hsl(var(--dash-violet))' },
      { name: 'Conversões', value: null, reported: false, fill: 'hsl(var(--dash-amber))' },
    ];
  }, [stats]);
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
        <div className="flex items-center gap-2 flex-wrap">
        {(['7d', '30d', '90d'] as Period[]).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={cn('h-8 px-3.5 rounded-lg text-xs font-medium border transition-colors', period === p ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50')}>{PERIOD_LABELS[p]}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
        <DashboardKpiCard size="hero" index={0} label="Campanhas enviadas" value={fmtInt(filtered.length)} delta={null} tile="blue" icon={Zap} bars={barsByDay(filtered.map((c) => c.started_at))} barsColor="blue" />
        <DashboardKpiCard size="hero" index={1} label="Taxa de envio" value={stats.total > 0 ? `${String(stats.successRate).replace('.', ',')}%` : '—'} delta={null} tile="green" icon={CheckCircle2} bars={null} barsColor="green" chart="none" />
        <DashboardKpiCard size="hero" index={2} label="Taxa de resposta" value={replyRate !== null ? `${String(replyRate).replace('.', ',')}%` : '—'} delta={sentTotal > 0 ? { text: `${repliedTotal} de ${sentTotal} responderam`, tone: 'muted' } : { text: 'sem envios no período', tone: 'muted' }} tile="violet" icon={Users} bars={null} barsColor="violet" chart="none" />
        <DashboardKpiCard size="hero" index={3}
          label="Envio por segmento"
          value={top3Segments.length > 0 ? `${top3Segments[0].rate.toString().replace('.', ',')}%` : '—'}
          delta={top3Segments.length > 0
            ? { text: top3Segments.map((sg) => `${sg.name.slice(0, 14)}: ${sg.rate.toString().replace('.', ',')}%`).join(' | '), tone: 'muted' }
            : { text: 'sem campanhas com segmento no período', tone: 'muted' }}
          tile="amber" icon={Target} bars={null} barsColor="amber" chart="none" />
        <DashboardKpiCard size="hero" index={4} label="Mensagens enviadas" value={fmtInt(stats.sent)} delta={null} tile="blue" icon={TrendingUp} bars={null} barsColor="blue" chart="none" />
        <DashboardKpiCard size="hero" index={5} label="Falhas" value={fmtInt(stats.failed)} delta={stats.total > 0 ? { pct: -Math.round((stats.failed / stats.total) * 100), invert: true } : null} tile="red" icon={XCircle} bars={null} barsColor="red" chart="none" />
      </div>

      {/* E75: respondentes agora derivam de replied_count no servidor (V18); a
          segmentação individual de respondentes deixa de ser consultada aqui. */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {barData.length > 0 && (
          <section className="rounded-2xl bg-card border border-border/70 p-4">
            <div className="flex items-center gap-2 mb-4">
              <IconTile icon={BarChart3} size={36} />
              <div><p className="text-[15px] font-bold text-foreground">Performance por Campanha</p><p className="text-xs text-foreground-secondary">Top {barData.length} campanhas por envio</p></div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: CHART_TICK_FONT_SIZE }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: CHART_TICK_FONT_SIZE }} stroke="hsl(var(--muted-foreground))" />
                <ReTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: CHART_TOOLTIP_FONT_SIZE }} />
                <Bar dataKey="Enviadas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Falhas" fill="hsl(var(--dash-red))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        )}

        <section className="rounded-2xl bg-card border border-border/70 p-4">
          <div className="flex items-center gap-2 mb-4">
            <IconTile icon={Target} color="violet" size={36} />
            <div><p className="text-[15px] font-bold text-foreground">Funil da Campanha</p><p className="text-xs text-foreground-secondary">Somente métricas confirmadas pela plataforma</p></div>
          </div>
          <div className="space-y-2.5">
            {funnelData.map((f, i) => {
              const widths = [100, 80, 55, 35];
              return (
                <div key={f.name} className="flex items-center gap-3">
                  <span className="text-xs text-foreground-secondary w-20 text-right shrink-0">{f.name}</span>
                  <div style={{ width: `${widths[i]}%` }} className="relative h-9 flex items-center justify-center rounded-lg" >
                    <div className="w-full h-9 rounded-lg flex items-center justify-center" style={{ background: f.fill + '33', border: `1.5px solid ${f.fill}55` }}>
                      <span className="text-[13px] font-bold text-foreground">{f.reported ? fmtInt(f.value ?? 0) : 'Não rastreado'}</span>
                    </div>
                  </div>
                  <span className="text-xs text-foreground-secondary w-12 shrink-0">{f.reported ? fmtPct(f.value ?? 0, funnelData[0].value ?? 0) : '—'}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

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
            <div><p className="text-[15px] font-bold text-foreground">Melhor horário</p><p className="text-xs text-foreground-secondary">Pico de entrega no período</p></div>
          </div>
          {bestHour ? (
            <div className="text-center py-4">
              <p className="text-5xl font-bold text-foreground tabular-nums leading-none">{String(bestHour.hour).padStart(2, '0')}h</p>
              {bestHour.day && <p className="text-sm text-foreground-secondary mt-1">{bestHour.day} &mdash; {bestHour.count} envios</p>}
              <p className="text-2xs text-muted-foreground mt-3 leading-snug">Programe campanhas próximas a este horário para maior taxa de abertura.</p>
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
      {/* E82: comparativo taxa de entrega */}
      {compareData.length >= 2 && (
        <section className="rounded-2xl bg-card border border-border/70 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <IconTile icon={TrendingUp} color="green" size={36} />
            <div>
              <p className="text-[15px] font-bold text-foreground">Comparativo de Campanhas</p>
              <p className="text-xs text-foreground-secondary">{`Últimas ${compareData.length} concluídas — envio vs falha`}</p>
            </div>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData} margin={{ top: 4, right: 4, left: -12, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: "hsl(var(--foreground-secondary))" }} tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={40} />
                <YAxis tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: "hsl(var(--foreground-secondary))" }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: CHART_TOOLTIP_FONT_SIZE }} formatter={(v) => [String(v) + '%', '']} />
                <Bar dataKey="Envio (%)" fill="hsl(var(--dash-green))" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  <LabelList dataKey="Envio (%)" position="top" formatter={(v: unknown) => Number(v) > 0 ? String(v) + '%' : ''} style={{ fontSize: CHART_LABEL_FONT_SIZE, fill: "hsl(var(--foreground-secondary))" }} />
                </Bar>
                <Bar dataKey="Falha (%)" fill="hsl(var(--dash-red))" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 justify-end">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-dash-green" /><span className="text-2xs text-foreground-secondary">Taxa de entrega</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-dash-red" /><span className="text-2xs text-foreground-secondary">Taxa de falha</span></div>
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
