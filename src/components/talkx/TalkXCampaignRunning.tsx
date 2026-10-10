// TalkXCampaignRunning.tsx — E77: Tela "Campanha em Andamento"
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { CHART_TICK_FONT_SIZE, CHART_TOOLTIP_FONT_SIZE } from '@/lib/chart-theme';
import {
  Users, ChevronLeft, RefreshCw, Activity, Send,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useTalkX, type TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useTalkXResumeChecklist, type TalkXResumeChecklistItemKey } from '@/hooks/integrations/useTalkXResumeChecklist';
import { TalkXResumeChecklist } from './tracking/TalkXResumeChecklist';
import { IconTile, RailCard, MetaRow, fmtInt, fmtDateTime, TalkXQueryBoundary, TalkXSkeletonRows, type TalkXQueryLike } from './talkxShared';
import { msToSeconds } from './talkxLimits';
import { TalkXLiveKpiRow } from './tracking/TalkXLiveKpiRow';
import { fromTable } from '@/lib/supabaseHelpers';
import { supabase } from '@/lib/supabaseHelpers';
import { talkXMessageSnapshotDisplay } from './talkxMessageSnapshot';
import { recentMinuteSeries, averageRatePerMinute, estimateMinutesToFinish } from './talkxRunningHistory';
import { TalkXCampaignActionsCard } from './tracking/TalkXCampaignActionsCard';
import { TalkXLimitsDialog } from './tracking/TalkXLimitsDialog';
import { TalkXRecipientRowActions } from './tracking/TalkXRecipientRowActions';
import {
  EMPTY_LIMITS_DRAFT, formatSendDays, limitsDraftFromCampaign,
  type TalkXCampaignWithRules, type TalkXLimitsDraft, type TalkXLimitsPayload,
} from './tracking/talkxCampaignRules';

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
  const elapsed = c.started_at ? Math.round((new Date().getTime() - new Date(c.started_at).getTime()) / 60000) : 0;
  return (
    <div className="space-y-4">
      {/* X146: faixa de KPIs ao vivo — a barra do antigo bloco "Progresso geral"
          foi absorvida pelo cartão "Destinatários Restantes". */}
      <TalkXLiveKpiRow
        variant="tela12"
        panel={{
          sent: c.sent_count,
          delivered: c.delivered_count,
          replied: c.replied_count ?? 0,
          failed: c.failed_count,
          outcome_unknown: outcomeUnknown,
          audience: c.total_recipients,
          elapsed_minutes: c.started_at ? elapsed : null,
          spark: {
            sent: chartData.map((point) => point.Enviadas),
            delivered: chartData.map((point) => point.Entregues),
          },
        }}
      />
      {/* Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RailCard title="Progresso da Campanha" subtitle={`${fmtInt(processed)} de ${fmtInt(c.total_recipients)} processados`} color="blue" icon={Activity}>
          <div className="pt-2">
            <DonutChart sent={c.sent_count} delivered={c.delivered_count} failed={c.failed_count} outcomeUnknown={outcomeUnknown} total={c.total_recipients} />
          </div>
        </RailCard>
      </div>
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
// X154: a conexão aparece pelo NOME e número (nunca o UUID), e o resumo ganha fuso e
// dias de envio. Cada linha só renderiza quando a campanha traz o dado (A9).
type TalkXConnectionRef = { name: string | null; phone_number: string | null };

function connectionLabel(connection: TalkXConnectionRef | null): string {
  if (!connection?.name) return '—';
  return connection.phone_number ? `${connection.name} · ${connection.phone_number}` : connection.name;
}

function TabConfig({ c, connection }: { c: TalkXCampaignWithRules; connection: TalkXConnectionRef | null }) {
  const daysLabel = formatSendDays(c.send_days);
  return (
    <RailCard title="Configurações da Campanha" color="amber" icon={Activity}>
      <div className="pt-1 space-y-0.5">
        <MetaRow label="Conexão" value={connectionLabel(connection)} />
        <MetaRow label="Velocidade" value={SPEED_LABEL[c.speed_profile ?? ''] ?? c.speed_profile ?? '—'} />
        <MetaRow label="Intervalo entre msgs" value={`${msToSeconds(c.send_interval_min)}s – ${msToSeconds(c.send_interval_max)}s`} />
        <MetaRow label="Delay de digitação" value={`${c.typing_delay_min}s – ${c.typing_delay_max}s`} />
        <MetaRow label="Janela de envio" value={c.send_window_start ? `${c.send_window_start?.slice(0, 5)} – ${c.send_window_end?.slice(0, 5)}` : 'Sem restrição'} />
        <MetaRow label="Horário comercial" value={c.business_hours_only ? 'Sim' : 'Não'} />
        {daysLabel !== null && <MetaRow label="Dias de envio" value={daysLabel} />}
        {c.schedule_timezone ? <MetaRow label="Fuso horário" value={c.schedule_timezone} /> : null}
        <MetaRow label="Iniciada em" value={fmtDateTime(c.started_at) ?? '—'} />
      </div>
    </RailCard>
  );
}


// ─── Tab: Destinatários ────────────────────────────────────────────────────────────────
type RecipRow = { id: string; campaign_id: string; contact_id: string; personalized_message: string | null; status: string; sent_at: string | null; delivered_at: string | null; error_message: string | null; manual_retry_count: number | null; created_at: string; contacts: { name: string; phone: string } | null };
const STATUS_TONE: Record<string, string> = { sent: 'text-dash-green', failed: 'text-dash-red', pending: 'text-foreground-secondary', outcome_unknown: 'text-dash-amber' };
const STATUS_LABEL: Record<string, string> = { sent: 'Enviado', failed: 'Falha', pending: 'Pendente', delivered: 'Entregue', outcome_unknown: 'Confirmação pendente' };

function TabRecipients({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const { data: recips, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['talkx-running-recipients', campaignId],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_recipients')
        .select('id, campaign_id, contact_id, personalized_message, status, sent_at, delivered_at, error_message, manual_retry_count, created_at, contacts:contact_id(name, phone)')
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
              {['Contato', 'Telefone', 'Status', 'Enviada em', 'Entregue em', ''].map((h) => (
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
                  <td className="px-4 py-2.5 text-2xs">
                    <TalkXRecipientRowActions recipient={r} onActionDone={() => { void qc.invalidateQueries({ queryKey: ['talkx-running-recipients', campaignId] }); }} />
                  </td>
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
  // E78/X154: limites editaveis — o rascunho do formulario vive aqui e o modal
  // (tracking/TalkXLimitsDialog) so desenha e monta o payload.
  const [limitsDraft, setLimitsDraft] = useState<TalkXLimitsDraft>(EMPTY_LIMITS_DRAFT);
  const [lSaving, setLSaving] = useState(false);
  const [resuming, setResuming] = useState(false);

  // P2: deriva somente de campanhas ativas; sai da view quando concluir/cancelar
  const campaign = useMemo(() => sending.find((c) => c.id === selectedId) ?? null, [sending, selectedId]);
  // X159: o "Checklist para retomar" só monta os 5 itens quando a campanha está pausada.
  const resumeChecklist = useTalkXResumeChecklist(campaign);
  // X159: o atalho de cada item leva à aba onde ele se resolve nesta tela.
  const handleChecklistNavigate = useCallback((key: TalkXResumeChecklistItemKey) => {
    setActiveTab(key === 'templates' ? 'messages' : key === 'segments' ? 'recipients' : 'config');
  }, []);
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

  // X154: a aba Configurações mostra a conexão pelo nome e número. A leitura é da
  // própria tabela de conexões (a campanha só guarda o id) e o mesmo dado alimenta a
  // linha "Conexão" — nunca o UUID.
  const connectionId = campaign?.whatsapp_connection_id ?? null;
  const { data: connection } = useQuery({
    queryKey: ['talkx-campaign-connection', connectionId],
    enabled: !!connectionId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await fromTable('whatsapp_connections')
        .select('name, phone_number')
        .eq('id', connectionId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TalkXConnectionRef | null;
    },
  });

  const handleOpenLimits = useCallback(() => {
    if (!campaign) return;
    setLimitsDraft(limitsDraftFromCampaign(campaign));
    setLimitsOpen(true);
  }, [campaign]);

  const handleChangeLimits = useCallback((patch: Partial<TalkXLimitsDraft>) => {
    setLimitsDraft((current) => ({ ...current, ...patch }));
  }, []);

  const handleSaveLimits = useCallback(async (limits: TalkXLimitsPayload) => {
    if (!campaign) return;
    setLSaving(true);
    try {
      await updateCampaignLimits.mutateAsync({
        id: campaign.id,
        expectedRevision: campaign.revision ?? null,
        limits,
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
  }, [campaign, updateCampaignLimits]);

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

  const handleResume = useCallback(async () => {
    if (!campaign) return;
    setResuming(true);
    try {
      // startCampaign aguarda o invoke e mostra toasts internamente
      await startCampaign(campaign.id);
    } catch {
      toast.error('Erro ao retomar campanha.');
    } finally { setResuming(false); }
  }, [campaign, startCampaign]);

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
                <>
                  {campaign.status === 'paused' && (
                    <TalkXResumeChecklist
                      items={resumeChecklist.items}
                      onToggle={resumeChecklist.toggle}
                      onNavigate={handleChecklistNavigate}
                      className="mb-4"
                    />
                  )}
                  <TabOverview c={campaign} chartData={sentHistory ?? []} historyQuery={historyQuery} onRetryHistory={handleRetryHistory} />
                </>
              )}
              {activeTab === 'config' && <TabConfig c={campaign} connection={connection ?? null} />}
              {activeTab === 'recipients' && <TabRecipients campaignId={campaign.id} />}
              {activeTab === 'messages' && <TabMessages campaignId={campaign.id} />}
              {activeTab === 'results' && <TabResults c={campaign} sentHistory={sentHistory ?? []} historyQuery={historyQuery} onRetryHistory={handleRetryHistory} />}
              {activeTab === 'logs' && <TabLogs campaignId={campaign.id} active={activeTab === 'logs'} />}
            </div>

            {/* Card Ações + Configurações Atuais (X154) */}
            <TalkXCampaignActionsCard
              campaign={campaign}
              onPause={() => setPauseOpen(true)}
              onResume={() => { void handleResume(); }}
              onCancel={() => setCancelOpen(true)}
              onEditLimits={handleOpenLimits}
              onViewMonitor={() => onViewMonitor(campaign.id)}
              resuming={resuming}
            />
          </>
        ) : null}
      </TalkXQueryBoundary>


      {/* Modal: Editar Limites (E78/X154) */}
      <TalkXLimitsDialog
        open={limitsOpen}
        onOpenChange={setLimitsOpen}
        draft={limitsDraft}
        onChange={handleChangeLimits}
        onSave={handleSaveLimits}
        saving={lSaving}
      />

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
