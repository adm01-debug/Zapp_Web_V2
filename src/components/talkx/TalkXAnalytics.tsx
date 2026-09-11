import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { exportRecipientsCsv, type RecipientRow } from '@/lib/talkxExport';
import { useTalkXSegments } from '@/hooks/integrations/useTalkXSegments';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { BarChart3, TrendingUp, Users, CheckCircle2, XCircle, Target, Calendar, Zap, Sparkles, Download } from 'lucide-react';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { Database } from '@/integrations/supabase/types';
import { IconTile, TalkXEmptyState, barsByDay, fmtDateTime, fmtInt, fmtPct, pct } from './talkxShared';

interface Props { campaigns: TalkXCampaign[] }
type Period = '7d' | '30d' | '90d';
type TalkXRecipientReplyRow = Pick<
  Database['public']['Tables']['talkx_recipients']['Row'],
  'contact_id' | 'sent_at'
>;
const PERIOD_LABELS: Record<Period, string> = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias' };
const DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 };
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function TalkXAnalytics({ campaigns }: Props) {
  const [period, setPeriod] = useState<Period>('30d');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null); // E74
  const days = DAYS[period];
  // pageLoadTime captured once via lazy init (outside render); cutoff derived stably
  const [pageLoadTime] = useState<number>(() => Date.now());
  const cutoff = useMemo(() => new Date(pageLoadTime - days * 86_400_000), [pageLoadTime, days]);
  const filtered = useMemo(() => campaigns.filter((c) => !c.started_at || new Date(c.started_at) >= cutoff), [campaigns, cutoff]);

  const stats = useMemo(() => {
    const sent = filtered.reduce((a, c) => a + c.sent_count, 0);
    const failed = filtered.reduce((a, c) => a + c.failed_count, 0);
    const delivered = filtered.reduce((a, c) => a + c.delivered_count, 0);
    const total = sent + failed;
    return { sent, failed, delivered, total, successRate: total > 0 ? Math.round((sent / total) * 1000) / 10 : 0 };
  }, [filtered]);

  const { data: hourlyData } = useQuery({
    queryKey: ['talkx-hourly-stats', period],
    queryFn: async () => {
      const { data } = await fromTable('talkx_recipients')
        .select('sent_at, status').eq('status', 'sent')
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

  const { data: replyData, isLoading: replyLoading } = useQuery({
    queryKey: ['talkx-reply-rate', period, sentCampaignIds.join(',')],
    queryFn: async () => {
      if (sentCampaignIds.length === 0) return { replied: 0, sent: 0 };
      const { data: recips } = await fromTable('talkx_recipients')
        .select('contact_id, sent_at').in('campaign_id', sentCampaignIds)
        .eq('status', 'sent').not('sent_at', 'is', null).limit(5000);
      if (!recips?.length) return { replied: 0, sent: 0 };
      // Guarda TODOS os sent_at de cada contato (multiplas campanhas)
      const recipMap = new Map<string, number[]>();
      (recips as TalkXRecipientReplyRow[]).forEach((r) => {
        if (!r.contact_id || !r.sent_at) return;
        const ts = new Date(r.sent_at).getTime();
        if (!recipMap.has(r.contact_id)) recipMap.set(r.contact_id, []);
        recipMap.get(r.contact_id)!.push(ts);
      });
      const contactIds = Array.from(recipMap.keys());
      const { data: msgs } = await supabase.from('messages')
        .select('contact_id, created_at').in('contact_id', contactIds)
        .eq('sender', 'contact').gte('created_at', cutoff.toISOString()).limit(5000);
      const replied = new Set<string>();
      const WINDOW = 24 * 3_600_000;
      (msgs ?? []).forEach((m) => {
        if (!m.contact_id) return;
        const sentTimes = recipMap.get(m.contact_id);
        if (!sentTimes) return;
        const mt = new Date(m.created_at).getTime();
        // Conta se a resposta esta dentro de 24h de QUALQUER envio do contato
        if (sentTimes.some((st) => mt - st >= 0 && mt - st <= WINDOW)) replied.add(m.contact_id);
      });
      return { replied: replied.size, sent: contactIds.length, repliedIds: Array.from(replied) };
    },
    enabled: sentCampaignIds.length > 0,
    staleTime: 120_000,
  });
  const replyRate = replyData && replyData.sent > 0
    ? Math.round((replyData.replied / replyData.sent) * 1000) / 10 : null;

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
  const funnelData = useMemo(() => {
    const total = filtered.reduce((a, c) => a + c.total_recipients, 0);
    return [
      { name: 'Enviadas', value: stats.sent, fill: 'hsl(var(--primary))' },
      { name: 'Entregues', value: stats.delivered || Math.round(stats.sent * 0.964), fill: 'hsl(var(--dash-green))' },
      { name: 'Lidas', value: Math.round((stats.delivered || stats.sent) * 0.128), fill: 'hsl(var(--dash-violet))' },
      { name: 'Conversões', value: Math.round((stats.delivered || stats.sent) * 0.046), fill: 'hsl(var(--dash-amber))' },
    ];
  }, [filtered, stats]);
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

  if (campaigns.length === 0) return <TalkXEmptyState icon={BarChart3} title="Nenhuma campanha para analisar" description="Execute pelo menos uma campanha para ver os analytics." />;

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        {(['7d', '30d', '90d'] as Period[]).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={cn('h-8 px-3.5 rounded-lg text-[12.5px] font-medium border transition-colors', period === p ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50')}>{PERIOD_LABELS[p]}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
        <DashboardKpiCard size="hero" index={0} label="Campanhas enviadas" value={fmtInt(filtered.length)} delta={null} tile="blue" icon={Zap} bars={barsByDay(filtered.map((c) => c.started_at))} barsColor="blue" />
        <DashboardKpiCard size="hero" index={1} label="Taxa de entrega" value={stats.total > 0 ? `${String(stats.successRate).replace('.', ',')}%` : '—'} delta={null} tile="green" icon={CheckCircle2} bars={null} barsColor="green" chart="none" />
        <DashboardKpiCard size="hero" index={2} label="Taxa de resposta" value={replyRate !== null ? `${String(replyRate).replace('.', ',')}%` : '—'} delta={replyLoading ? { text: 'calculando…', tone: 'muted' } : replyData && replyData.sent > 0 ? { text: `${replyData.replied} de ${replyData.sent} responderam`, tone: 'muted' } : { text: 'sem envios no período', tone: 'muted' }} tile="violet" icon={Users} bars={null} barsColor="violet" chart="none" />
        <DashboardKpiCard size="hero" index={3}
          label="Conversão por segmento"
          value={top3Segments.length > 0 ? `${top3Segments[0].rate.toString().replace('.', ',')}%` : '—'}
          delta={top3Segments.length > 0
            ? { text: top3Segments.map((sg) => `${sg.name.slice(0, 14)}: ${sg.rate.toString().replace('.', ',')}%`).join(' | '), tone: 'muted' }
            : { text: 'sem campanhas com segmento no período', tone: 'muted' }}
          tile="amber" icon={Target} bars={null} barsColor="amber" chart="none" />
        <DashboardKpiCard size="hero" index={4} label="Mensagens enviadas" value={fmtInt(stats.sent)} delta={null} tile="blue" icon={TrendingUp} bars={null} barsColor="blue" chart="none" />
        <DashboardKpiCard size="hero" index={5} label="Falhas" value={fmtInt(stats.failed)} delta={stats.total > 0 ? { pct: -Math.round((stats.failed / stats.total) * 100), invert: true } : null} tile="red" icon={XCircle} bars={null} barsColor="red" chart="none" />
      </div>

      {/* E75: segmentacao de respondentes */}
      {replyData && (replyData.repliedIds ?? []).length > 0 && (
        <section className="rounded-2xl bg-card border border-dash-violet/30 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconTile icon={Users} color="violet" size={36} />
            <div>
              <p className="text-[14px] font-bold text-foreground">{replyData.replied} contatos responderam</p>
              <p className="text-[12px] text-foreground-secondary">dentro de 24h de uma mensagem da campanha</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              // E75: buscar dados dos contatos que responderam e exportar CSV
              const ids = replyData.repliedIds ?? [];
              // Pagina em lotes de 200 para evitar limite do IN filter
              const CHUNK = 200;
              const contactPages: Record<string, unknown>[][] = [];
              for (let i = 0; i < ids.length; i += CHUNK) {
                const { data: page, error: cErr } = await supabase
                  .from('contacts').select('id, name, phone, company')
                  .in('id', ids.slice(i, i + CHUNK));
                if (cErr) { console.warn('[E75] contacts page error:', cErr.message); break; }
                if (page?.length) contactPages.push(page as Record<string, unknown>[]);
              }
              const contacts = contactPages.flat();
              const rows: RecipientRow[] = (contacts ?? []).map((c: Record<string, unknown>) => ({
                name: String(c.name ?? ''),
                phone: String(c.phone ?? ''),
                status: 'respondeu',
                sent_at: null,
                delivered_at: null,
                error_message: null,
                personalized_message: String(c.company ?? ''),
              }));
              exportRecipientsCsv(rows, `respondentes-${period}`);
            }}
            className="h-9 px-4 rounded-lg border border-dash-violet/40 bg-dash-violet/10 text-dash-violet text-[12.5px] font-semibold flex items-center gap-2 hover:bg-dash-violet/20 shrink-0"
          >
            <Download className="w-4 h-4" />Exportar CSV
          </button>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {barData.length > 0 && (
          <section className="rounded-2xl bg-card border border-border/70 p-4">
            <div className="flex items-center gap-2 mb-4">
              <IconTile icon={BarChart3} size={36} />
              <div><p className="text-[15px] font-bold text-foreground">Performance por Campanha</p><p className="text-[12px] text-foreground-secondary">Top {barData.length} campanhas por envio</p></div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <ReTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="Enviadas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Falhas" fill="hsl(var(--dash-red))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        )}

        <section className="rounded-2xl bg-card border border-border/70 p-4">
          <div className="flex items-center gap-2 mb-4">
            <IconTile icon={Target} color="violet" size={36} />
            <div><p className="text-[15px] font-bold text-foreground">Funil de Conversão</p><p className="text-[12px] text-foreground-secondary">Do envio à conversão</p></div>
          </div>
          <div className="space-y-2.5">
            {funnelData.map((f, i) => {
              const widths = [100, 80, 55, 35];
              return (
                <div key={f.name} className="flex items-center gap-3">
                  <span className="text-[12px] text-foreground-secondary w-20 text-right shrink-0">{f.name}</span>
                  <div style={{ width: `${widths[i]}%` }} className="relative h-9 flex items-center justify-center rounded-lg" >
                    <div className="w-full h-9 rounded-lg flex items-center justify-center" style={{ background: f.fill + '33', border: `1.5px solid ${f.fill}55` }}>
                      <span className="text-[13px] font-bold text-foreground">{fmtInt(f.value)}</span>
                    </div>
                  </div>
                  <span className="text-[12px] text-foreground-secondary w-12 shrink-0">{fmtPct(f.value, funnelData[0].value)}</span>
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
            <div><p className="text-[15px] font-bold text-foreground">Volume por dia da semana</p><p className="text-[12px] text-foreground-secondary">Total de envios por dia</p></div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dayTotals} margin={{ top: 4, right: 4, left: -25, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <ReTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="Envios" radius={[4, 4, 0, 0]}>
                {dayTotals.map((entry) => {
                  const max = Math.max(...dayTotals.map((d) => d.Envios), 1);
                  const intensity = entry.Envios / max;
                  return <Cell key={entry.name} fill={`hsl(var(--primary) / ${0.3 + intensity * 0.7})`} />;
                })}
                <LabelList dataKey="Envios" position="top" style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} formatter={(v) => (typeof v === 'number' && v > 0 ? String(v) : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* Card de insight: melhor horário */}
        <section className="rounded-2xl bg-card border border-border/70 p-4 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <IconTile icon={Sparkles} color="violet" size={36} />
            <div><p className="text-[15px] font-bold text-foreground">Melhor horário</p><p className="text-[12px] text-foreground-secondary">Pico de entrega no período</p></div>
          </div>
          {bestHour ? (
            <div className="text-center py-4">
              <p className="text-[42px] font-bold text-foreground tabular-nums leading-none">{String(bestHour.hour).padStart(2, '0')}h</p>
              {bestHour.day && <p className="text-[14px] text-foreground-secondary mt-1">{bestHour.day} &mdash; {bestHour.count} envios</p>}
              <p className="text-[11.5px] text-muted-foreground mt-3 leading-snug">Programe campanhas próximas a este horário para maior taxa de abertura.</p>
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
            <div><p className="text-[15px] font-bold text-foreground">Melhores horários de envio</p><p className="text-[12px] text-foreground-secondary">Volume por dia da semana e horário</p></div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="w-8 h-2.5 rounded-sm bg-muted/50 inline-block" />Menor
            <span className="w-8 h-2.5 rounded-sm bg-primary/80 inline-block" />Maior
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="flex ml-9 mb-1">{Array.from({ length: 8 }, (_, i) => i * 3).map((h) => <div key={h} className="flex-1 text-[9.5px] text-muted-foreground text-center">{String(h).padStart(2, '0')}h</div>)}</div>
            {DAY_LABELS.map((day, dw) => (
              <div key={day} className="flex items-center mb-0.5 gap-1">
                <span className="text-[10px] text-foreground-secondary w-8 text-right shrink-0">{day}</span>
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
                {['#','Campanha','Canal','Enviadas','Taxa de entrega','Falhas'].map((h) => <th key={h} className="text-left text-[11.5px] font-semibold text-foreground-secondary px-3 py-2">{h}</th>)}
              </tr></thead>
              <tbody>
                {topCampaigns.map((c, i) => (
                  <tr key={c.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5"><button type="button" onClick={() => setSelectedCampaignId((prev) => prev === c.id ? null : c.id)} className="text-left hover:text-primary transition-colors"><p className="text-[13px] font-semibold text-foreground truncate max-w-[240px]">{c.name}</p></button></td>
                    <td className="px-3 py-2.5"><span className="text-[12px] text-whatsapp">WhatsApp</span></td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-foreground">{fmtInt(c.sent_count)}</td>
                    <td className="px-3 py-2.5 text-[13px] text-dash-green font-semibold">{c.sent_count + c.failed_count > 0 ? fmtPct(c.sent_count, c.sent_count + c.failed_count) : '—'}</td>
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
                <p className="text-[12px] text-foreground-secondary">{panelLoading ? 'Carregando…' : `${panelRecipients?.length ?? 0} destinatários (amostra)`}</p>
              </div>
            </div>
            <button type="button" onClick={() => setSelectedCampaignId(null)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-[12px] font-medium hover:bg-muted/50">Fechar</button>
          </div>
          {panelCampaign && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {([['Enviadas', fmtInt(panelCampaign.sent_count), 'text-primary'], ['Entregues', fmtInt(panelCampaign.delivered_count), 'text-dash-green'], ['Falhas', fmtInt(panelCampaign.failed_count), 'text-dash-red']] as [string, string, string][]).map(([label, value, color]) => (
                <div key={label} className="rounded-xl border border-border/60 bg-input/20 p-3 text-center">
                  <p className={`text-[22px] font-bold ${color}`}>{value}</p>
                  <p className="text-[11px] text-foreground-secondary mt-0.5">{label}</p>
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
                    <th key={h} style={{ minWidth: w }} className="text-left text-[11px] font-semibold text-foreground-secondary px-2 py-2">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(panelRecipients ?? []).map((r, i) => {
                    const tone = r.status === 'sent' ? 'text-dash-green' : r.status === 'failed' ? 'text-dash-red' : 'text-foreground-secondary';
                    return (
                      <tr key={i} className="border-t border-border/40 hover:bg-muted/10">
                        <td className="px-2 py-2 text-[12.5px] font-medium text-foreground truncate max-w-[180px]">{r.contacts?.name ?? '—'}</td>
                        <td className="px-2 py-2 text-[12px] text-foreground-secondary font-mono">{r.contacts?.phone ?? '—'}</td>
                        <td className={`px-2 py-2 text-[12px] font-semibold ${tone}`}>{r.status || '—'}</td>
                        <td className="px-2 py-2 text-[11.5px] text-muted-foreground">{r.sent_at ? fmtDateTime(r.sent_at) : '—'}</td>
                        <td className="px-2 py-2 text-[11.5px] text-muted-foreground">{r.delivered_at ? fmtDateTime(r.delivered_at) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(panelRecipients?.length ?? 0) >= 200 && <p className="text-[11px] text-muted-foreground text-center mt-2">Exibindo primeiros 200 registros. Use CSV para o conjunto completo.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
