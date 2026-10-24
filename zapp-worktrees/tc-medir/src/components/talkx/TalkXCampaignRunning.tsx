// TalkXCampaignRunning.tsx — E77: Tela "Campanha em Andamento"
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { CHART_TICK_FONT_SIZE, CHART_TOOLTIP_FONT_SIZE } from '@/lib/chart-theme';
import {
  Zap, CheckCircle2, AlertTriangle, Users, ChevronLeft,
  Pause, Square, Eye, RefreshCw, Activity, Settings2, Mail, Send,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useTalkX, type TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { IconTile, RailCard, MetaRow, fmtInt, fmtDateTime, TalkXQueryBoundary, TalkXSkeletonRows, type TalkXQueryLike } from './talkxShared';
import { msToSeconds, secondsToMs, intervalForProfile, isValidIntervalSeconds, LIMITS_MIN_S, LIMITS_MAX_S } from './talkxLimits';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { fromTable } from '@/lib/supabaseHelpers';
import { supabase, invokeEdge } from '@/lib/supabaseHelpers';
import { talkXMessageSnapshotDisplay } from './talkxMessageSnapshot';
import { recentMinuteSeries, averageRatePerMinute, estimateMinutesToFinish } from './talkxRunningHistory';

// ─── Sub-tab type ──────────────────────────────────────────────────────────────
type RunTab = 'overview' | 'recipients' | 'messages' | 'config' | 'results' | 'logs';
const RUN_TABS: { id: RunTab; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'recipients', label: 'Destinatários' },
  { id: 'messages', label: 'Mensagens' },
  { id: 'config', label: 'Configurações' },
  { id: 'results', label: 'Resultados' },
  { id: 'logs', label: 'Logs em Tempo Real' },
];

// ─── Speed label ───────────────────────────────────────────────────────────────
const SPEED_LABEL: Record<string, string> = {
  slow: 'Lento (seguro)',
  moderate: 'Moderado',
  fast: 'Rápido',
};

// ─── Donut SVG ─────────────────────────────────────────────────────────────────
function DonutChart({ sent, delivered, failed, outcomeUnknown, total }: { sent: number; delivered: number; failed: number; outcomeUnknown: number; total: number }) {
  const R = 72, CX = 88, CY = 88, STROKE = 18;
  const circ = 2 * Math.PI * R;
  const pct = (n: number) => total > 0 ? (n / total) * circ : 0;
  const pending = Math.max(0, total - sent - failed - outcomeUnknown);
  const segments = [
    { val: delivered, color: 'hsl(var(--dash-green))', label: 'Entregues' },
    { val: sent - delivered, color: 'hsl(var(--primary))', label: 'Enviadas' },
    { val: failed, color: 'hsl(var(--dash-red))', label: 'Falhas' },
    { val: outcomeUnknown, color: 'hsl(var(--dash-amber))', label: 'A confirmar' },
    { val: pending, color: 'hsl(var(--muted))', label: 'Pendentes' },
  ];
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={176} height={176} viewBox="0 0 176 176">
        {total === 0
          ? <circle cx={CX} cy={CY} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={STROKE} />
          : segments.map(({ val, color }, i) => {
              const dash = pct(val);
              const el = (
                <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={color}
                  strokeWidth={STROKE} strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset} style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }} />
              );
              offset += dash;
              return el;
            })
        }
        <text x={CX} y={CY - 6} textAnchor="middle" className="fill-foreground" fontSize={22} fontWeight={700}>{total > 0 ? Math.round(((sent + failed + outcomeUnknown) / total) * 100) : 0}%</text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="fill-foreground-secondary" fontSize={11}>concluído</text>
      </svg>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {segments.map(({ val, color, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-foreground-secondary">{label}</span>
            <span className="font-semibold text-foreground ml-auto">{fmtInt(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Visão Geral ──────────────────────────────────────────────────────────
function TabOverview({ c, chartData, historyQuery, onRetryHistory }: {
  c: TalkXCampaign;
  chartData: { time: string; Enviadas: number; Entregues: number }[];
  historyQuery: TalkXQueryLike;
  onRetryHistory: () => void;
}) {
  const outcomeUnknown = c.outcome_unknown_count ?? 0;
  const processed = c.sent_count + c.failed_count + outcomeUnknown;
  const pending = Math.max(0, c.total_recipients - processed);
  const elapsed = c.started_at ? Math.round((new Date().getTime() - new Date(c.started_at).getTime()) / 60000) : 0;
  return (
    <div className="space-y-4">
      {/* Donut + KPIs lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RailCard title="Progresso da Campanha" subtitle={`${fmtInt(processed)} de ${fmtInt(c.total_recipients)} processados`} color="blue" icon={Activity}>
          <div className="pt-2">
            <DonutChart sent={c.sent_count} delivered={c.delivered_count} failed={c.failed_count} outcomeUnknown={outcomeUnknown} total={c.total_recipients} />
          </div>
        </RailCard>
        <div className="grid grid-cols-2 gap-3 content-start">
          <DashboardKpiCard size="compact" index={0} label="Enviadas" value={fmtInt(c.sent_count)} delta={{ text: `de ${fmtInt(c.total_recipients)} prev.`, tone: 'muted' }} tile="blue" icon={Zap} bars={null} barsColor="blue" chart="none" />
          <DashboardKpiCard size="compact" index={1} label="Entregues" value={fmtInt(c.delivered_count)} delta={{ text: c.sent_count > 0 ? `${Math.round((c.delivered_count / c.sent_count) * 100)}% das enviadas` : '—', tone: 'muted' }} tile="green" icon={CheckCircle2} bars={null} barsColor="green" chart="none" />
          <DashboardKpiCard size="compact" index={2} label="Falhas" value={fmtInt(c.failed_count)} delta={c.sent_count > 0 ? { text: `${Math.round((c.failed_count / c.sent_count) * 100)}% de erro`, tone: 'muted' } : null} tile="red" icon={AlertTriangle} bars={null} barsColor="red" chart="none" />
          <DashboardKpiCard size="compact" index={3} label="A confirmar" value={fmtInt(outcomeUnknown)} delta={{ text: 'Sem reenvio automático', tone: 'muted' }} tile="amber" icon={AlertTriangle} bars={null} barsColor="amber" chart="none" />
          <DashboardKpiCard size="compact" index={4} label="Restantes" value={fmtInt(pending)} delta={{ text: `${elapsed}min decorridos`, tone: 'muted' }} tile="amber" icon={Users} bars={null} barsColor="amber" chart="none" />
        </div>
      </div>
      {/* Barra de progresso */}
      {c.total_recipients > 0 && (
        <div className="rounded-2xl bg-card border border-border/70 p-4 space-y-2">
          <div className="flex justify-between text-xs text-foreground-secondary">
            <span>Progresso geral</span>
            <span>{fmtInt(processed)} / {fmtInt(c.total_recipients)} contatos</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (processed / c.total_recipients) * 100)}%` }} />
          </div>
        </div>
      )}
      {/* Ritmo de Envio — X047: carregando -> erro -> vazio -> conteúdo */}
      <TalkXQueryBoundary
        query={historyQuery}
        entity="estatísticas de envio"
        onRetry={onRetryHistory}
        skeleton={(
          <div className="rounded-2xl bg-card border border-border/70 p-4">
            <TalkXSkeletonRows rows={4} />
          </div>
        )}
        isEmpty={chartData.length === 0}
        empty={(
          <RailCard title="Ritmo de Envio" color="blue" icon={Activity}>
            <p className="pt-2 text-xs text-foreground-secondary">Nenhum envio registrado nesta campanha ainda.</p>
          </RailCard>
        )}
      >
        <RailCard title="Ritmo de Envio" color="blue" icon={Activity}>
          <div className="h-[160px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="rg-sent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="10%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }} tickLine={false} axisLine={false} />
                <ReTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: CHART_TOOLTIP_FONT_SIZE }} />
                <Area type="monotone" dataKey="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rg-sent)" dot={false} />
                <Area type="monotone" dataKey="Entregues" stroke="hsl(var(--dash-green))" strokeWidth={2} fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </RailCard>
      </TalkXQueryBoundary>
    </div>
  );
}

// ─── Tab: Configurações ────────────────────────────────────────────────────────
function TabConfig({ c }: { c: TalkXCampaign }) {
  return (
    <RailCard title="Configurações da Campanha" color="amber" icon={Activity}>
      <div className="pt-1 space-y-0.5">
        <MetaRow label="Velocidade" value={SPEED_LABEL[c.speed_profile ?? ''] ?? c.speed_profile ?? '—'} />
        <MetaRow label="Intervalo entre msgs" value={`${msToSeconds(c.send_interval_min)}s – ${msToSeconds(c.send_interval_max)}s`} />
        <MetaRow label="Delay de digitação" value={`${c.typing_delay_min}s – ${c.typing_delay_max}s`} />
        <MetaRow label="Janela de envio" value={c.send_window_start ? `${c.send_window_start?.slice(0, 5)} – ${c.send_window_end?.slice(0, 5)}` : 'Sem restrição'} />
        <MetaRow label="Horário comercial" value={c.business_hours_only ? 'Sim' : 'Não'} />
        <MetaRow label="Iniciada em" value={fmtDateTime(c.started_at) ?? '—'} />
        <MetaRow label="Canal WhatsApp" value={c.whatsapp_connection_id ?? '—'} />
      </div>
    </RailCard>
  );
}


// ─── Tab: Destinatários ────────────────────────────────────────────────────────────────
type RecipRow = { status: string; sent_at: string | null; delivered_at: string | null; error_message: string | null; contacts: { name: string; phone: string } | null };
const STATUS_TONE: Record<string, string> = { sent: 'text-dash-green', failed: 'text-dash-red', pending: 'text-foreground-secondary', outcome_unknown: 'text-dash-amber' };
const STATUS_LABEL: Record<string, string> = { sent: 'Enviado', failed: 'Falha', pending: 'Pendente', delivered: 'Entregue', outcome_unknown: 'Confirmação pendente' };

function TabRecipients({ campaignId }: { campaignId: string }) {
  const { data: recips, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['talkx-running-recipients', campaignId],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_recipients')
        .select('status, sent_at, delivered_at, error_message, contacts:contact_id(name, phone)')
        .eq('campaign_id', campaignId).order('updated_at', { ascending: false }).limit(200);
      // X047: sem isto a falha virava lista vazia (o `data ?? []` engolia o erro).
      if (error) throw error;
      return (data ?? []) as RecipRow[];
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  return (
    <div className="rounded-2xl bg-card border border-border/70 overflow-hidden">
      {/* X047: carregando -> erro -> vazio -> conteúdo (cabeçalho e lista juntos) */}
      <TalkXQueryBoundary
        query={{ isLoading, isFetching, isError, error }}
        entity="informações dos destinatários"
        onRetry={() => { void refetch(); }}
        skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
        isEmpty={(recips?.length ?? 0) === 0}
        empty={(
          <div className="p-8 text-center">
            <Users className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs font-semibold text-foreground">Nenhum destinatário nesta campanha.</p>
          </div>
        )}
      >
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <p className="text-[13px] font-bold text-foreground">Destinatários</p>
          <p className="text-xs text-foreground-secondary">{`Mostrando ${recips?.length ?? 0} recentes`}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse">
            <thead><tr>
              {['Contato', 'Telefone', 'Status', 'Enviada em', 'Entregue em'].map((h) => (
                <th key={h} className="text-left text-2xs font-semibold text-foreground-secondary px-4 py-2">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(recips ?? []).map((r, i) => (
                <tr key={i} className="border-t border-border/40 hover:bg-muted/10">
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground truncate max-w-[180px]">{r.contacts?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground-secondary font-mono">{r.contacts?.phone ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-xs font-semibold ${STATUS_TONE[r.status] ?? 'text-foreground-secondary'}`}>{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="px-4 py-2.5 text-2xs text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-2xs text-muted-foreground">{r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(recips?.length ?? 0) >= 200 && <p className="text-2xs text-muted-foreground text-center p-3">Mostrando 200 mais recentes.</p>}
        </div>
      </TalkXQueryBoundary>
    </div>
  );
}

// ─── Tab: Mensagens ────────────────────────────────────────────────────────────
// A campanha pode ser alterada depois de iniciada. Por isso, esta tela só mostra
// o snapshot individual gravado pelo worker; nunca reconstitui conteúdo usando o
// template atual da campanha.
type MessageRow = {
  id: string;
  status: string;
  personalized_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  contacts: { name: string; phone: string } | null;
};

function TabMessages({ campaignId }: { campaignId: string }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const { data: messages, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['talkx-running-messages', campaignId],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_recipients')
        .select('id, status, personalized_message, sent_at, delivered_at, error_message, contacts:contact_id(name, phone)')
        .eq('campaign_id', campaignId)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const snapshotCount = messages?.filter((message) => Boolean(message.personalized_message?.trim())).length ?? 0;
  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-2xl bg-card border border-border/70 overflow-hidden">
      {/* X047: carregando -> erro -> vazio -> conteúdo (cabeçalho e lista juntos) */}
      <TalkXQueryBoundary
        query={{ isLoading, isFetching, isError, error }}
        entity="mensagens"
        onRetry={() => { void refetch(); }}
        skeleton={<div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 bg-muted/40 rounded-xl animate-pulse" />)}</div>}
        isEmpty={(messages?.length ?? 0) === 0}
        empty={(
          <div className="p-8 text-center">
            <Send className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs font-semibold text-foreground">Nenhum destinatário nesta campanha.</p>
          </div>
        )}
      >
        <div className="px-4 py-3 border-b border-border/40 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-bold text-foreground">Mensagens por destinatário</p>
            <p className="text-2xs text-foreground-secondary mt-0.5">Snapshots personalizados e imutáveis gravados antes do disparo.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-2xs font-semibold text-foreground-secondary">
            <Send className="h-3.5 w-3.5 text-primary" />
            {`${snapshotCount} com conteúdo`}
          </span>
        </div>
        <div className="divide-y divide-border/40">
          {messages?.map((message) => {
            const materialized = message.personalized_message?.trim() ?? '';
            const canExpand = materialized.length > 360;
            const isExpanded = expandedIds.has(message.id);
            const content = talkXMessageSnapshotDisplay(message.personalized_message, message.status);
            const shownContent = canExpand && !isExpanded ? `${content.slice(0, 360)}…` : content;
            const eventAt = message.delivered_at ?? message.sent_at;

            return (
              <article key={message.id} className="px-4 py-3 hover:bg-muted/10">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-xs font-semibold text-foreground">{message.contacts?.name ?? 'Contato indisponível'}</p>
                  <span className="text-2xs font-mono text-foreground-secondary">{message.contacts?.phone ?? '—'}</span>
                  <span className={`ml-auto text-2xs font-semibold ${STATUS_TONE[message.status] ?? 'text-foreground-secondary'}`}>
                    {STATUS_LABEL[message.status] ?? message.status}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground-secondary">{shownContent}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-3xs text-muted-foreground">
                  {eventAt && <span>{message.delivered_at ? 'Entregue' : 'Enviada'} em {fmtDateTime(eventAt)}</span>}
                  {canExpand && (
                    <button type="button" onClick={() => toggleExpanded(message.id)} className="font-semibold text-primary hover:underline">
                      {isExpanded ? 'Mostrar menos' : 'Ler mensagem completa'}
                    </button>
                  )}
                </div>
                {message.error_message && <p className="mt-2 text-2xs text-dash-red break-words">Falha: {message.error_message}</p>}
              </article>
            );
          })}
        </div>
        {(messages?.length ?? 0) >= 100 && <p className="border-t border-border/40 p-3 text-center text-2xs text-muted-foreground">Mostrando as 100 mensagens mais recentes.</p>}
      </TalkXQueryBoundary>
    </div>
  );
}



// ─── Tab: Logs em Tempo Real (E80) ──────────────────────────────────────
type LogEvent = { id: string; contact: string; phone: string; status: string; ts: string; error?: string | null };
const LOG_TONE: Record<string, string> = { sent: 'text-dash-green', failed: 'text-dash-red', skipped: 'text-foreground-secondary', delivered: 'text-primary' };
const LOG_ICON: Record<string, string> = { sent: '✔', failed: '✘', skipped: '‒', delivered: '✔✔' };

function TabLogs({ campaignId, active }: { campaignId: string; active: boolean }) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // X047: a carga inicial dos logs engolia o erro (`if (data)`) — uma falha virava
  // "Aguardando eventos de envio…". Agora é uma consulta de verdade, com
  // carregando/erro/refetch, e os eventos do realtime entram no cache dela.
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['talkx-running-logs', campaignId],
    queryFn: async () => {
      const { data: rows, error: queryError } = await fromTable('talkx_recipients')
        .select('id, status, updated_at, error_message, contacts:contact_id(name, phone)')
        .eq('campaign_id', campaignId)
        .not('status', 'eq', 'pending')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (queryError) throw queryError;
      return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        contact: (r.contacts as { name: string } | null)?.name ?? '—',
        phone: (r.contacts as { phone: string } | null)?.phone ?? '—',
        status: r.status as string,
        ts: r.updated_at as string,
        error: r.error_message as string | null,
      }));
    },
    enabled: active && !!campaignId,
  });

  const events = data ?? [];

  useEffect(() => {
    if (!active || !campaignId) return;

    // Subscription realtime nos talkx_recipients desta campanha
    const ch = supabase
      .channel(`talkx-logs-${campaignId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'talkx_recipients',
        filter: `campaign_id=eq.${campaignId}`,
      }, (payload) => {
        const r = payload.new as Record<string, unknown>;
        if (r.status === 'pending') return;
        const ev: LogEvent = {
          id: r.id as string,
          contact: '—', // sem join em realtime; enriquece se ja temos o contato
          phone: '—',
          status: r.status as string,
          ts: r.updated_at as string,
          error: r.error_message as string | null,
        };
        // O evento entra na mesma lista da consulta: uma fonte só para a tela.
        queryClient.setQueryData<LogEvent[]>(['talkx-running-logs', campaignId], (prev) =>
          [ev, ...(prev ?? []).filter((e) => e.id !== ev.id)].slice(0, 50));
      })
      .subscribe();
    channelRef.current = ch;

    return () => { void supabase.removeChannel(ch); };
  }, [campaignId, active, queryClient]);

  return (
    <div className="rounded-2xl bg-card border border-border/70 overflow-hidden">
      {/* X047: carregando -> erro -> vazio -> conteúdo (cabeçalho e lista juntos) */}
      <TalkXQueryBoundary
        query={{ isLoading, isFetching, isError, error }}
        entity="atividades em tempo real"
        onRetry={() => { void refetch(); }}
        skeleton={<div className="p-4"><TalkXSkeletonRows rows={4} /></div>}
        isEmpty={events.length === 0}
        empty={<p className="text-xs text-muted-foreground text-center p-8">Aguardando eventos de envio…</p>}
      >
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <p className="text-[13px] font-bold text-foreground">Logs em Tempo Real</p>
          <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-dash-green">
            <span className="w-2 h-2 rounded-full bg-dash-green animate-pulse" />Ao vivo
          </span>
        </div>
        <div className="divide-y divide-border/30 max-h-[480px] overflow-y-auto">
          {events.map((ev) => (
            <div key={`${ev.id}-${ev.ts}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/10">
              <span className={`text-[15px] leading-none mt-0.5 ${LOG_TONE[ev.status] ?? 'text-muted-foreground'}`}>{LOG_ICON[ev.status] ?? '●'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-foreground truncate">{ev.contact} <span className="text-muted-foreground font-normal">{ev.phone}</span></p>
                  <span className={`text-2xs font-semibold ml-auto shrink-0 ${LOG_TONE[ev.status] ?? 'text-foreground-secondary'}`}>{ev.status}</span>
                </div>
                {ev.error && <p className="text-2xs text-dash-red mt-0.5 truncate">{ev.error}</p>}
                <p className="text-3xs text-muted-foreground mt-0.5">{new Date(ev.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
              </div>
            </div>
          ))}
        </div>
      </TalkXQueryBoundary>
    </div>
  );
}

// ─── Tab: Resultados ───────────────────────────────────────────────────────────────
function TabResults({ c, sentHistory, historyQuery, onRetryHistory }: {
  c: TalkXCampaign;
  sentHistory: { time: string; Enviadas: number; Entregues: number }[];
  historyQuery: TalkXQueryLike;
  onRetryHistory: () => void;
}) {
  const deliveryRate = c.sent_count > 0 ? Math.round((c.delivered_count / c.sent_count) * 1000) / 10 : null;
  const outcomeUnknown = c.outcome_unknown_count ?? 0;
  const totalProcessed = c.sent_count + c.failed_count + outcomeUnknown;
  const failRate = totalProcessed > 0 ? Math.round((c.failed_count / totalProcessed) * 1000) / 10 : null;
  const elapsed = c.started_at ? Math.round((new Date().getTime() - new Date(c.started_at).getTime()) / 60000) : null;
  const pending = Math.max(0, c.total_recipients - totalProcessed);
  // Ritmo real (msgs/min) sobre os últimos 10 minutos CONSECUTIVOS (zeros incluídos).
  // Minutos sem envio entram no denominador — sem isso o prazo ficava otimista (R2-MOD-033).
  const avgRateRaw = averageRatePerMinute(sentHistory, 10);
  // Rótulo do ritmo com uma casa quando é fração: arredondar 0,4 para 0 escondia uma
  // previsão que existe.
  const avgRateText = avgRateRaw === null
    ? '—'
    : `${(Math.round(avgRateRaw * 10) / 10).toString().replace('.', ',')} msgs/min`;
  // ETA: ritmo 0 (dez minutos sem envio) ou ausente → indisponível, nunca Infinity
  // (recusa do item #135).
  const etaMinutes = estimateMinutesToFinish(pending, avgRateRaw);

  const METRICS: { label: string; value: string; sub?: string }[] = [
    { label: 'Total de destinatários', value: fmtInt(c.total_recipients) },
    { label: 'Enviadas', value: fmtInt(c.sent_count), sub: c.total_recipients > 0 ? `${Math.round((c.sent_count / c.total_recipients) * 100)}% do total` : undefined },
    { label: 'Entregues', value: fmtInt(c.delivered_count), sub: deliveryRate !== null ? `${deliveryRate.toString().replace('.', ',')}% das enviadas` : undefined },
    { label: 'Falhas', value: fmtInt(c.failed_count), sub: failRate !== null ? `${failRate.toString().replace('.', ',')}% do total processado` : undefined },
    { label: 'A confirmar', value: fmtInt(outcomeUnknown), sub: outcomeUnknown > 0 ? 'Sem reenvio automático' : undefined },
    { label: 'Pendentes', value: fmtInt(pending) },
    { label: 'Tempo decorrido', value: elapsed !== null ? `${elapsed} min` : '—' },
    { label: 'Ritmo médio (últ. 10 min)', value: avgRateText },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {METRICS.map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl border border-border/60 bg-card p-3">
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-2xs font-semibold text-foreground-secondary mt-0.5">{label}</p>
            {sub && <p className="text-3xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>
      {c.started_at && c.status === 'sending' && pending > 0 && (
        <TalkXQueryBoundary
          query={historyQuery}
          entity="estatísticas de envio"
          onRetry={onRetryHistory}
          skeleton={(
            <div className="rounded-2xl bg-card border border-border/70 p-4">
              <TalkXSkeletonRows rows={2} />
            </div>
          )}
          isEmpty={sentHistory.length === 0}
          empty={(
            <div className="rounded-2xl bg-card border border-border/70 p-4">
              <p className="text-[13px] font-bold text-foreground mb-1">Tempo estimado para concluir</p>
              <p className="text-2xl font-bold text-muted-foreground">Indisponível</p>
              <p className="text-2xs text-foreground-secondary">Sem envios nos últimos 10 minutos — não há ritmo para estimar.</p>
            </div>
          )}
        >
          <div className="rounded-2xl bg-card border border-border/70 p-4">
            <p className="text-[13px] font-bold text-foreground mb-1">Tempo estimado para concluir</p>
            {etaMinutes !== null ? (
              <>
                <p className="text-2xl font-bold text-primary">{etaMinutes} min</p>
                <p className="text-2xs text-foreground-secondary">Baseado no ritmo atual ({avgRateText})</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground">Indisponível</p>
                <p className="text-2xs text-foreground-secondary">Sem envios nos últimos 10 minutos — não há ritmo para estimar.</p>
              </>
            )}
          </div>
        </TalkXQueryBoundary>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
interface Props {
  onBack: () => void;
  onViewMonitor: (id: string) => void;
  initialCampaignId?: string | null;
}

export function TalkXCampaignRunning({ onBack, onViewMonitor, initialCampaignId }: Props) {
  const {
    campaigns, updateCampaign, updateCampaignLimits, pauseCampaign, cancelCampaign, startCampaign,
    refetchCampaigns, isLoading: campaignsLoading, isFetching: campaignsFetching,
    isError: campaignsIsError, error: campaignsError,
  } = useTalkX();
  const sending = useMemo(() => campaigns.filter((c) => c.status === 'sending' || c.status === 'paused'), [campaigns]);

  const [selectedId, setSelectedId] = useState<string | null>(initialCampaignId ?? sending[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<RunTab>('overview');
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  // E78: limites editaveis
  const [lSpeed, setLSpeed] = useState<string>('');
  const [lIntMin, setLIntMin] = useState<number>(0);
  const [lIntMax, setLIntMax] = useState<number>(0);
  const [lWinStart, setLWinStart] = useState<string>('');
  const [lWinEnd, setLWinEnd] = useState<string>('');
  const [lBizHours, setLBizHours] = useState<boolean>(false);
  const [lSaving, setLSaving] = useState(false);
  const [resuming, setResuming] = useState(false);

  // X006: o select de velocidade mostra "Personalizado" quando o intervalo
  // digitado à mão difere do intervalo do perfil escolhido (o perfil é mantido).
  const intervaloCustomizado = useMemo(() => {
    const [pMin, pMax] = intervalForProfile(lSpeed);
    return lIntMin !== msToSeconds(pMin) || lIntMax !== msToSeconds(pMax);
  }, [lSpeed, lIntMin, lIntMax]);

  // P2: deriva somente de campanhas ativas; sai da view quando concluir/cancelar
  const campaign = useMemo(() => sending.find((c) => c.id === selectedId) ?? null, [sending, selectedId]);
  // Auto-navegar de volta quando a campanha sair de sending/paused.
  // Transição em UM efeito só: o estado anterior é lido ANTES de a referência ser
  // atualizada. Com dois efeitos separados a limpeza ficava morta — o primeiro gravava
  // `campaign = null` na referência e o segundo, ao testar `prevCampaignRef.current !== null`,
  // já encontrava `null` e nunca limpava seleção nem modais (R2-MOD-032).
  const prevCampaignRef = React.useRef<TalkXCampaign | null>(campaign);
  React.useEffect(() => {
    const prevCampaign = prevCampaignRef.current;
    prevCampaignRef.current = campaign;
    if (prevCampaign !== null && selectedId && !sending.some((c) => c.id === selectedId)) {
      // Campanha saiu da lista ativa (concluiu ou foi cancelada remotamente).
      // Sem isso, um modal de acao (Pausar/Cancelar/Editar Limites) aberto no
      // momento da transicao ficava preso: a campanha some, os handlers fazem
      // no-op silencioso (guard `if (!campaign) return`), e o modal nunca fecha.
      toast.info('Campanha concluída ou cancelada.');
      setSelectedId(null);
      setPauseOpen(false);
      setCancelOpen(false);
      setLimitsOpen(false);
    }
  }, [campaign, sending, selectedId]);

  // Histórico de envios para gráfico AreaChart (últimos 20 pontos por minuto)
  const { data: sentHistory, isLoading: historyLoading, isFetching: historyFetching, isError: historyIsError, error: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['talkx-running-history', selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      // Ordem decrescente: o teto de 2000 guarda os envios MAIS RECENTES. Com ordem
      // crescente, o envio 2001+ ficava de fora e a série congelava no passado.
      const { data, error } = await fromTable('talkx_recipients')
        .select('sent_at, delivered_at')
        .eq('campaign_id', selectedId)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(2000);
      // X047: sem isto a falha virava "sem envios" (o `if (!data?.length) return []` engolia o erro).
      if (error) throw error;
      if (!data?.length) return [];
      // Buckets de minuto consecutivos (zeros incluídos), terminando no minuto atual.
      return recentMinuteSeries(
        data as { sent_at: string; delivered_at: string | null }[],
        { minutes: 20 },
      );
    },
    enabled: !!selectedId,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const historyQuery: TalkXQueryLike = {
    isLoading: historyLoading,
    isFetching: historyFetching,
    isError: historyIsError,
    error: historyError,
  };
  const handleRetryHistory = useCallback(() => { void refetchHistory(); }, [refetchHistory]);

  const handleOpenLimits = useCallback(() => {
    if (!campaign) return;
    setLSpeed(campaign.speed_profile ?? 'moderate');
    setLIntMin(msToSeconds(campaign.send_interval_min));
    setLIntMax(msToSeconds(campaign.send_interval_max));
    setLWinStart(campaign.send_window_start?.slice(0, 5) ?? '');
    setLWinEnd(campaign.send_window_end?.slice(0, 5) ?? '');
    setLBizHours(campaign.business_hours_only ?? false);
    setLimitsOpen(true);
  }, [campaign]);

  const handleSaveLimits = useCallback(async () => {
    if (!campaign) return;
    if (!isValidIntervalSeconds(lIntMin) || !isValidIntervalSeconds(lIntMax)) {
      toast.error(`Intervalos devem ser inteiros entre ${LIMITS_MIN_S}s e ${LIMITS_MAX_S}s.`);
      return;
    }
    setLSaving(true);
    try {
      await updateCampaignLimits.mutateAsync({
        id: campaign.id,
        expectedRevision: campaign.revision ?? null,
        limits: {
          speed_profile: lSpeed,
          send_interval_min: secondsToMs(lIntMin),
          send_interval_max: secondsToMs(Math.max(lIntMin, lIntMax)),
          send_window_start: lWinStart ? `${lWinStart}:00` : null,
          send_window_end: lWinEnd ? `${lWinEnd}:00` : null,
          business_hours_only: lBizHours,
        },
      });
      setLimitsOpen(false);
      toast.success('Limites atualizados. Vale a partir do próximo envio.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(msg.includes('stale_revision')
        ? 'A campanha mudou em outra aba. Recarregue e tente de novo.'
        : 'Erro ao salvar limites.');
    } finally {
      setLSaving(false);
    }
  }, [campaign, updateCampaignLimits, lSpeed, lIntMin, lIntMax, lWinStart, lWinEnd, lBizHours]);

  const handlePause = useCallback(async () => {
    if (!campaign) return;
    setPauseOpen(false);
    try {
      await pauseCampaign(campaign.id, pauseReason.trim() || undefined);
      setPauseReason('');
      toast.info('Campanha pausada.');
    } catch {
      toast.error('Erro ao pausar a campanha.');
    }
  }, [campaign, pauseCampaign, pauseReason]);

  const handleCancel = useCallback(async () => {
    if (!campaign) return;
    setCancelOpen(false);
    try {
      await cancelCampaign(campaign.id);
      toast.warning('Campanha cancelada.');
      onBack();
    } catch {
      toast.error('Erro ao cancelar a campanha.');
    }
  }, [campaign, cancelCampaign, onBack]);

  return (
    <div className="min-h-full bg-background p-3 md:p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} aria-label="Voltar" className="p-1.5 rounded-lg hover:bg-muted/50 shrink-0">
            <ChevronLeft className="w-5 h-5 text-foreground-secondary" />
          </button>
          <IconTile icon={Activity} color="green" size={40} glow />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground leading-tight truncate">Campanha em Andamento</h1>
            <p className="text-xs text-foreground-secondary">Acompanhe e gerencie envios ativos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Seletor de campanha */}
          <select
            value={selectedId ?? ''}
            onChange={(e) => { setSelectedId(e.target.value || null); setActiveTab('overview'); }}
            aria-label="Selecionar campanha"
            className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium max-w-[220px] truncate focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {sending.length === 0 && (
              <option value="">
                {campaignsLoading ? 'Carregando campanhas…' : campaignsIsError ? 'Campanhas indisponíveis' : 'Nenhuma campanha ativa'}
              </option>
            )}
            {sending.map((c) => (
              <option key={c.id} value={c.id}>{c.name} [{c.status}]</option>
            ))}
          </select>
          <button type="button" onClick={() => { void refetchCampaigns(); }} title="Atualizar" className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/70 bg-input/40 hover:bg-muted/50">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* X047: a lista de campanhas decide carregando -> erro -> vazio -> conteúdo */}
      <TalkXQueryBoundary
        query={{ isLoading: campaignsLoading, isFetching: campaignsFetching, isError: campaignsIsError, error: campaignsError }}
        entity="campanhas"
        onRetry={() => { void refetchCampaigns(); }}
        skeleton={<div className="rounded-2xl border border-border/50 bg-card p-4"><TalkXSkeletonRows rows={4} /></div>}
        isEmpty={sending.length === 0 || !campaign}
        empty={(
          <div className="rounded-2xl border border-border/50 bg-muted/20 p-10 text-center">
            <p className="text-sm text-foreground-secondary">Nenhuma campanha em andamento no momento.</p>
          </div>
        )}
      >
        {campaign ? (
          <>
            {/* Sub-tabs */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-border/40 pb-0">
              {RUN_TABS.map((t) => (
                <button
                  key={t.id} type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors
                    ${activeTab === t.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-foreground-secondary hover:text-foreground'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Conteúdo das sub-tabs */}
            <div>
              {activeTab === 'overview' && (
                <TabOverview c={campaign} chartData={sentHistory ?? []} historyQuery={historyQuery} onRetryHistory={handleRetryHistory} />
              )}
              {activeTab === 'config' && <TabConfig c={campaign} />}
              {activeTab === 'recipients' && <TabRecipients campaignId={campaign.id} />}
              {activeTab === 'messages' && <TabMessages campaignId={campaign.id} />}
              {activeTab === 'results' && <TabResults c={campaign} sentHistory={sentHistory ?? []} historyQuery={historyQuery} onRetryHistory={handleRetryHistory} />}
              {activeTab === 'logs' && <TabLogs campaignId={campaign.id} active={activeTab === 'logs'} />}
            </div>

            {/* Card Ações */}
            <div className="rounded-2xl bg-card border border-border/70 p-4">
              <p className="text-[13px] font-bold text-foreground mb-3">Ações da Campanha</p>
              <div className="flex flex-wrap gap-2">
                {campaign.status === 'sending' && (
                  <button type="button" onClick={() => setPauseOpen(true)}
                    className="h-9 px-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-2 hover:bg-amber-500/20">
                    <Pause className="w-4 h-4" />Pausar
                  </button>
                )}
                {campaign.status === 'paused' && (
                  <button type="button" disabled={resuming} onClick={async () => {
                    setResuming(true);
                    try {
                      // startCampaign aguarda o invoke e mostra toasts internamente
                      await startCampaign(campaign.id);
                    } catch {
                      toast.error('Erro ao retomar campanha.');
                    } finally { setResuming(false); }
                  }}
                    className="h-9 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-semibold flex items-center gap-2 hover:bg-primary/20 disabled:opacity-50">
                    <Zap className="w-4 h-4" />{resuming ? 'Retomando…' : 'Retomar'}
                  </button>
                )}
                <button type="button" onClick={handleOpenLimits}
                  className="h-9 px-4 rounded-lg border border-border/70 bg-input/40 text-xs font-semibold flex items-center gap-2 hover:bg-muted/50">
                  <Settings2 className="w-4 h-4" />Editar Limites
                </button>
                <button type="button" onClick={() => onViewMonitor(campaign.id)}
                  className="h-9 px-4 rounded-lg border border-border/70 bg-input/40 text-xs font-semibold flex items-center gap-2 hover:bg-muted/50">
                  <Eye className="w-4 h-4" />Ver Monitor
                </button>
                {(campaign.status === 'completed' || campaign.status === 'paused') && (
                  <button type="button" onClick={async () => {
                    try {
                      await invokeEdge('talkx-report', { campaignId: campaign.id });
                      toast.success('Relatório enviado por e-mail!');
                    } catch {
                      toast.error('Erro ao enviar relatório.');
                    }
                  }}
                    className="h-9 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-semibold flex items-center gap-2 hover:bg-primary/20">
                    <Mail className="w-4 h-4" />Enviar Relatório
                  </button>
                )}
                <button type="button" onClick={() => setCancelOpen(true)}
                  className="h-9 px-4 rounded-lg border border-red-500/30 bg-red-500/8 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2 hover:bg-red-500/15 ml-auto">
                  <Square className="w-4 h-4" />Cancelar campanha
                </button>
              </div>
            </div>
          </>
        ) : null}
      </TalkXQueryBoundary>


      {/* Modal: Editar Limites (E78) */}
      <AlertDialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Editar Limites de Envio</AlertDialogTitle>
            <AlertDialogDescription>Vale a partir do próximo envio.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Velocidade</label>
              <select value={intervaloCustomizado ? 'personalizado' : lSpeed}
                onChange={(e) => {
                  const p = e.target.value;
                  if (p === 'personalizado') return;
                  setLSpeed(p);
                  const [minMs, maxMs] = intervalForProfile(p);
                  setLIntMin(msToSeconds(minMs));
                  setLIntMax(msToSeconds(maxMs));
                }}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="slow">Lento (seguro)</option>
                <option value="moderate">Moderado</option>
                <option value="fast">Rápido</option>
                {intervaloCustomizado && <option value="personalizado">Personalizado</option>}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Intervalo mínimo (s)</label>
                <input type="number" min={LIMITS_MIN_S} max={LIMITS_MAX_S} value={lIntMin} onChange={(e) => setLIntMin(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Intervalo máximo (s)</label>
                <input type="number" min={LIMITS_MIN_S} max={LIMITS_MAX_S} value={lIntMax} onChange={(e) => setLIntMax(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Janela início</label>
                <input type="time" value={lWinStart} onChange={(e) => setLWinStart(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Janela fim</label>
                <input type="time" value={lWinEnd} onChange={(e) => setLWinEnd(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={lBizHours} onChange={(e) => setLBizHours(e.target.checked)} className="rounded" />
              <span className="text-xs text-foreground">Apenas horário comercial (seg–sex 8h–18h)</span>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveLimits} disabled={lSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90">
              {lSaving ? 'Salvando…' : 'Salvar Limites'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Pausar */}
      <AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar Campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              O envio será interrompido até você retomar. Mensagens em voo continuarão sendo entregues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea
            className="w-full min-h-[64px] rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Motivo da pausa (opcional)"
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePause} className="bg-warning text-warning-foreground hover:bg-warning/90">Pausar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Cancelar */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Os destinatários restantes não receberão a mensagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-white hover:bg-destructive/90">Confirmar cancelamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
