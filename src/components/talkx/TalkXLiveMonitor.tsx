import React, { useEffect, useState, useMemo } from 'react';
import {
  Pause, Square, Play, Timer, CheckCircle2, Loader2,
  SkipForward, Activity, RefreshCw, Zap, Inbox,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { useTalkXMonitor } from '@/hooks/integrations/useTalkXMonitor';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { CHART_TICK_FONT_SIZE, CHART_TOOLTIP_FONT_SIZE } from '@/lib/chart-theme';
import { Progress } from '@/components/ui/progress';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useTalkXLifecycle, TalkXLifecycleDialog } from './useTalkXLifecycle';
import { useTalkXEvents } from '@/hooks/integrations/useTalkXEvents';
import { useTalkXConnectionStatus } from '@/hooks/integrations/useTalkXConnectionStatus';
import { IconTile, RailCard, MetaRow, StatusPill, CAMPAIGN_STATUS, fmtInt, pct, fmtDateTime } from './talkxShared';
import { TalkXLiveKpiRow } from './tracking/TalkXLiveKpiRow';
import { TalkXQueryBoundary, TalkXEmptyState, TalkXSkeletonRows } from './kit/states';
import { TalkXRecipientsTable, RECIPIENTS_READ_LIMIT, type TalkXRecipientRow } from './tracking/TalkXRecipientsTable';
interface Props { campaignId: string; onBack?: () => void }
type MonitorTab = 'overview' | 'recipients' | 'timeline';
const REFETCH = 4000;
const REAL_RECIPIENT_STATUS_FILTERS = new Set(['pending', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'outcome_unknown']);
const RECIPIENTS_CUTOFF_NOTE = `Mostrando os ${RECIPIENTS_READ_LIMIT} destinatários mais recentes. Pode haver mais registros; use o filtro de status para recortar a consulta.`;

export function TalkXLiveMonitor({ campaignId, onBack }: Props) {
  const qc = useQueryClient();
  const lifecycle = useTalkXLifecycle();
  // X047: cada bloco assíncrono deste Monitor declara o próprio estado (carga/erro/vazio)
  // e o próprio refetch. O retry de um bloco não troca a campanha aberta.
  const {
    events, isLoading: eventsLoading, isError: eventsError, error: eventsErrorObj, refetch: refetchEvents,
  } = useTalkXEvents(campaignId);
  const [tab, setTab] = useState<MonitorTab>('overview');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');

  const {
    data: campaign,
    isFetching,
    isLoading: campaignLoading,
    isError: campaignError,
    error: campaignErrorObj,
    refetch: refetchCampaign,
  } = useQuery({
    queryKey: ['talkx-campaign-live', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from('talkx_campaigns').select('*').eq('id', campaignId).single();
      if (error) throw error;
      return data as TalkXCampaign;
    },
    refetchInterval: REFETCH,
  });

  const { label: connStatusLabel } = useTalkXConnectionStatus(campaign?.whatsapp_connection_id);

  // X150/TL-158: estados reais recortam a consulta no banco; estados derivados
  // (Lida/Respondida/Sem telefone) continuam sendo filtrados na tabela porque não
  // existem como valor de `talkx_recipients.status`.
  const statusQueryFilter = REAL_RECIPIENT_STATUS_FILTERS.has(statusFilter) ? statusFilter : 'all';
  const {
    data: recipientsData,
    isLoading: recipientsLoading,
    isError: recipientsError,
    error: recipientsErrorObj,
    refetch: refetchRecipients,
  } = useQuery({
    queryKey: ['talkx-recipients-monitor', campaignId, statusQueryFilter],
    queryFn: async () => {
      let query = supabase.from('talkx_recipients')
        .select('id, status, sent_at, delivered_at, read_at, replied_at, updated_at, personalized_message, error_message, segment_id, segments:segment_id(name), contacts:contact_id(name, nickname, phone, company, avatar_url, lead_origin)')
        .eq('campaign_id', campaignId);
      if (statusQueryFilter !== 'all') query = query.eq('status', statusQueryFilter);
      const { data, error } = await query.order('updated_at', { ascending: false }).limit(RECIPIENTS_READ_LIMIT);
      if (error) throw error;
      return ((data ?? []) as (TalkXRecipientRow & { segments?: { name?: string | null } | null })[]).map((row) => ({
        ...row,
        segment_name: row.segment_name ?? row.segments?.name ?? null,
      }));
    },
    refetchInterval: REFETCH,
  });
  const recipients = recipientsData ?? [];
  const recipientsCutoffNote = recipients.length >= RECIPIENTS_READ_LIMIT ? RECIPIENTS_CUTOFF_NOTE : undefined;

  useEffect(() => {
    const ch = supabase.channel(`talkx-mon-${campaignId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'talkx_campaigns', filter: `id=eq.${campaignId}` }, () => qc.invalidateQueries({ queryKey: ['talkx-campaign-live', campaignId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talkx_recipients', filter: `campaign_id=eq.${campaignId}` }, () => qc.invalidateQueries({ queryKey: ['talkx-recipients-monitor', campaignId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId, qc]);

  // Elapsed timer — Date.now() runs in effect/callback, never in render body
  useEffect(() => {
    if (!campaign?.started_at) return; // stays 0 (initial state) when no start time
    const startMs = new Date(campaign.started_at).getTime();
    const update = () => setElapsedSec(Math.floor((Date.now() - startMs) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [campaign?.started_at]);
  const elapsed = elapsedSec === 0 ? null : (() => {
    const m = Math.floor(elapsedSec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${elapsedSec % 60}s`;
  })();

  const outcomeUnknown = campaign?.outcome_unknown_count ?? 0;
  const processed = campaign ? campaign.sent_count + campaign.failed_count + outcomeUnknown : 0;
  const progress = campaign && campaign.total_recipients > 0 ? pct(processed, campaign.total_recipients) : 0;

  // Real rate data from hook (E02) — replaced Math.random with actual DB data
  const { rateByMinute: chartData, isLoading: rateLoading, isError: rateError, refetch: refetchRate } = useTalkXMonitor(campaignId);

  // X047: o boundary decide na ordem carregando -> erro -> vazio -> conteudo. O erro tem
  // precedência sobre o vazio: consulta que falhou mostra "Não foi possível carregar" e o
  // botão que refaz ESTA consulta — nunca esqueleto infinito nem "campanha não encontrada".
  // As entidades são plurais femininas de propósito: `TalkXErrorState` monta o título com
  // "as <entidade>" fixo (kit/states.tsx), então substantivo masculino renderiza "as os …".
  if (campaignLoading || campaignError || !campaign) {
    return (
      <TalkXQueryBoundary
        query={{ isLoading: campaignLoading, isFetching, isError: campaignError, error: campaignErrorObj }}
        entity="campanhas"
        onRetry={() => refetchCampaign()}
        skeleton={<div className="space-y-4"><div className="h-32 bg-muted rounded-2xl" /><TalkXSkeletonRows rows={3} variant="kpi" /></div>}
        isEmpty={!campaign}
        empty={<TalkXEmptyState icon={Inbox} title="Campanha não encontrada" description="A campanha aberta não existe mais ou foi removida." />}
      >
        <></>
      </TalkXQueryBoundary>
    );
  }

  const isRunning = campaign.status === 'sending';
  const isPaused = campaign.status === 'paused';
  const isDone = campaign.status === 'completed' || campaign.status === 'cancelled';

  return (
    <div className="space-y-4 min-w-0" aria-busy={isFetching ? 'true' : undefined}>
      <div className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile icon={isRunning ? Zap : isPaused ? Pause : CheckCircle2} color={isRunning ? 'blue' : isPaused ? 'amber' : 'green'} size={48} />
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{campaign.name}</h2>
              <p className="text-xs text-foreground-secondary line-clamp-1">{campaign.message_template}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {elapsed && <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-border/70 bg-input/40"><Timer className="w-3.5 h-3.5 text-muted-foreground"/>{elapsed}</span>}
            <StatusPill status={campaign.status} map={CAMPAIGN_STATUS}/>
            {isFetching && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin"/>}
            {!isDone && (<>
              {isRunning && <button type="button" onClick={()=>lifecycle.request({ kind: 'pause', target: campaign })} className="h-9 px-3.5 rounded-lg border border-dash-amber/40 bg-dash-amber/10 text-dash-amber text-xs font-semibold flex items-center gap-1.5 hover:bg-dash-amber/20"><Pause className="w-4 h-4"/>Pausar</button>}
              {isPaused && <button type="button" onClick={()=>lifecycle.request({ kind: 'resume', target: campaign })} className="h-9 px-3.5 rounded-lg border border-primary/40 bg-primary/10 text-primary-glow text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/20"><Play className="w-4 h-4"/>Retomar</button>}
              <button type="button" onClick={()=>lifecycle.request({ kind: 'cancel', target: campaign })} className="h-9 px-3.5 rounded-lg border border-dash-red/40 bg-dash-red/10 text-dash-red text-xs font-semibold flex items-center gap-1.5 hover:bg-dash-red/20"><Square className="w-4 h-4"/>Cancelar</button>
            </>)}
          </div>
        </div>
        <Progress value={progress} className="h-3 mb-1.5"/>
        <div className="flex items-center justify-between text-2xs text-foreground-secondary">
          <span>{progress}% concluído · {fmtInt(processed)} de {fmtInt(campaign.total_recipients)}</span>
          {isRunning && <span className="text-primary-glow font-medium animate-pulse">Enviando agora…</span>}
          {campaign.completed_at && <span>Concluída em {fmtDateTime(campaign.completed_at)}</span>}
        </div>
      </div>

      {/* X146: faixa de KPIs ao vivo — o mesmo componente da tela 12 (Em andamento).
          A fonte de opt-out por campanha (CAP-026) ainda não existe no front: sem o
          número, o cartão Opt-outs não entra na faixa. */}
      <TalkXLiveKpiRow
        variant="tela11"
        panel={{
          sent: campaign.sent_count,
          delivered: campaign.delivered_count,
          replied: campaign.replied_count ?? 0,
          failed: campaign.failed_count,
          outcome_unknown: outcomeUnknown,
          audience: campaign.total_recipients,
          opt_outs: null,
          forecast: null,
          vs_yesterday: null,
          spark: {
            sent: chartData.map((point) => point.Enviadas),
            delivered: chartData.map((point) => point.Entregues),
          },
        }}
        onFilterOutcomeUnknown={() => { setStatusFilter('outcome_unknown'); setTab('recipients'); }}
      />

      <div className="flex items-center gap-1 border-b border-border/60">
        {([['overview','Visão Geral'],['recipients','Destinatários'],['timeline','Linha do Tempo']] as [MonitorTab,string][]).map(([t,l]) => (
          <button key={t} type="button" onClick={()=>setTab(t)} className={cn('h-9 px-3.5 text-xs font-medium border-b-2 transition-colors',tab===t?'border-primary text-foreground':'border-transparent text-foreground-secondary hover:text-foreground hover:border-border')}>{l}</button>
        ))}
      </div>

      {tab==='overview' && (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <section className="rounded-2xl bg-card border border-border/70 p-4">
            <p className="text-sm font-bold text-foreground mb-3">Ritmo de Entrega <span className="text-xs font-normal text-foreground-secondary ml-1">(últimos 60 min · estimado)</span></p>
            <TalkXQueryBoundary
              query={{ isLoading: rateLoading, isError: rateError, error: null }}
              entity="estimativas de ritmo"
              onRetry={() => refetchRate()}
              skeleton={<TalkXSkeletonRows rows={3} variant="rail" />}
              isEmpty={chartData.length === 0}
              empty={<div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">Sem envios nos últimos 60 minutos.</div>}
            >
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData} margin={{top:5,right:5,left:-25,bottom:5}}>
                  <defs><linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize: CHART_TICK_FONT_SIZE}} stroke="hsl(var(--muted-foreground))"/>
                  <YAxis tick={{fontSize: CHART_TICK_FONT_SIZE}} stroke="hsl(var(--muted-foreground))"/>
                  <ReTooltip contentStyle={{background:'hsl(var(--popover))',border:'1px solid hsl(var(--border))',borderRadius:12,fontSize: CHART_TOOLTIP_FONT_SIZE}}/>
                  <Area type="monotone" dataKey="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gS)" dot={false}/>
                  <Area type="monotone" dataKey="Entregues" stroke="hsl(var(--dash-green))" strokeWidth={2} fill="none" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </TalkXQueryBoundary>
          </section>
          <RailCard icon={Activity} title="Saúde da Campanha" right={<Pill label={isRunning?'Em andamento':isPaused?'Pausada':'Concluída'} tone={isRunning?'info':isPaused?'warning':'success'} dot/>}>
            <MetaRow label="Status" value={isRunning?'Enviando normalmente':isPaused?'Envio pausado':campaign.status}/>
            <MetaRow label="Conexão WA" value={connStatusLabel ?? '—'}/>
            <MetaRow label="Iniciado em" value={campaign.started_at?fmtDateTime(campaign.started_at):'—'}/>
          </RailCard>
        </div>

        {/* X150 — tela 12, card "Entregas em Tempo Real": a MESMA tabela da aba
            Destinatários, com o selo "Enviando agora" enquanto o motor envia
            (`status === 'sending'`; não existe `worker_state` no schema). */}
        <section className="min-w-0 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-[13px] font-bold text-foreground">Entregas em Tempo Real</p>
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-2xs font-semibold text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
                Enviando agora
              </span>
            )}
          </div>
          <TalkXRecipientsTable
            rows={recipients}
            variant="deliveries"
            isLoading={recipientsLoading}
            isError={recipientsError}
            error={recipientsErrorObj}
            onRetry={() => refetchRecipients()}
            pagination="more"
            pageSize={5}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            note={recipientsCutoffNote}
            emptyTitle="Nenhuma entrega ainda"
            emptyDescription="A lista aparece no primeiro envio desta campanha."
          />
        </section>
        </>
      )}

      {tab==='recipients' && (
        <section className="min-w-0">
          {/* X150: tabela única (mesma da tela 11), com as colunas da tela 12. */}
          <TalkXRecipientsTable
            title="Destinatários"
            rows={recipients}
            variant="deliveries"
            isLoading={recipientsLoading}
            isError={recipientsError}
            error={recipientsErrorObj}
            onRetry={() => refetchRecipients()}
            pagination="more"
            pageSize={20}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            note={recipientsCutoffNote}
            emptyTitle="Nenhum destinatário encontrado"
            emptyDescription="Ajuste o filtro de status ou aguarde os primeiros envios."
          />
        </section>
      )}

      {tab==='timeline' && (
        <section className="rounded-2xl bg-card border border-border/70 p-4">
          <p className="text-[15px] font-bold text-foreground mb-3">Linha do Tempo Operacional</p>
          <TalkXQueryBoundary
            query={{ isLoading: eventsLoading, isError: eventsError, error: eventsErrorObj }}
            entity="atividades da campanha"
            onRetry={() => refetchEvents()}
            skeleton={<TalkXSkeletonRows rows={3} />}
            isEmpty={events.length === 0}
            empty={<p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>}
          >
            <div className="space-y-0">
              {events.map((ev,i) => (
                <div key={ev.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0',ev.event_type==='started'?'bg-primary':ev.event_type==='completed'?'bg-dash-green':ev.event_type==='paused'?'bg-dash-amber':ev.event_type==='cancelled'?'bg-dash-red':'bg-border')}/>
                    {i<events.length-1 && <div className="w-px flex-1 bg-border/50 my-0.5"/>}
                  </div>
                  <div className="pb-3 min-w-0">
                    <p className="text-xs font-medium text-foreground">{ev.message||ev.event_type}</p>
                    <p className="text-2xs text-muted-foreground">{fmtDateTime(ev.created_at)}{ev.actor?.name?` · ${ev.actor.name}`:''}</p>
                  </div>
                </div>
              ))}
            </div>
          </TalkXQueryBoundary>
        </section>
      )}

      <TalkXLifecycleDialog controller={lifecycle} />
    </div>
  );
}
