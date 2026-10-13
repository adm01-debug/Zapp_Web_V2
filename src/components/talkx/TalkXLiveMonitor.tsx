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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pill, InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign, TalkXRecipient } from '@/hooks/integrations/useTalkX';
import { useTalkXLifecycle, TalkXLifecycleDialog } from './useTalkXLifecycle';
import { useTalkXEvents } from '@/hooks/integrations/useTalkXEvents';
import { useTalkXConnectionStatus } from '@/hooks/integrations/useTalkXConnectionStatus';
import { IconTile, RailCard, MetaRow, StatusPill, CAMPAIGN_STATUS, RECIPIENT_STATUS, fmtInt, pct, fmtDateTime, fmtAgo } from './talkxShared';
import { TalkXLiveKpiRow } from './tracking/TalkXLiveKpiRow';
import { TalkXServerResumePrecheck } from './tracking/TalkXServerResumePrecheck';
import { useTalkXServerResumePrecheck } from '@/hooks/integrations/useTalkXServerResumePrecheck';
import { TalkXQueryBoundary, TalkXEmptyState, TalkXSkeletonRows } from './kit/states';
import { TalkXHealthCard } from './tracking/TalkXHealthCard';
import { campaignPauseReason, talkxLastSentAt, talkxRatePerMinute, talkxStallWindowMs } from './tracking/talkxHealth';
interface Props { campaignId: string; onBack?: () => void; onOpenHelp?: () => void }
type MonitorTab = 'overview' | 'recipients' | 'timeline';
const REFETCH = 4000;

export function TalkXLiveMonitor({ campaignId, onBack, onOpenHelp }: Props) {
  const qc = useQueryClient();
  const lifecycle = useTalkXLifecycle();
  // X047: cada bloco assíncrono deste Monitor declara o próprio estado (carga/erro/vazio)
  // e o próprio refetch. O retry de um bloco não troca a campanha aberta.
  const {
    events, isLoading: eventsLoading, isError: eventsError, error: eventsErrorObj, refetch: refetchEvents,
  } = useTalkXEvents(campaignId);
  const [tab, setTab] = useState<MonitorTab>('overview');
  const [statusFilter, setStatusFilter] = useState('all');
  const [elapsedSec, setElapsedSec] = useState(0);
  // X148/TL-157: "Ver o que fazer" do card de saúde abre a Ajuda do módulo. A
  // Ajuda é uma TELA com rota própria na URL (TL-174, `TalkXHelpCenter`), não
  // mais um diálogo local — por isso sobe por `onOpenHelp` (o pai é quem sabe
  // navegar para `?screen=help`), em vez de um estado de dialog aqui. O
  // pause/cancel/resume do rodapé também não tem mais estado próprio aqui —
  // vive no controlador único `useTalkXLifecycle`/`TalkXLifecycleDialog` (TL-054/X050).

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

  const {
    data: recipientsData,
    isLoading: recipientsLoading,
    isError: recipientsError,
    error: recipientsErrorObj,
    refetch: refetchRecipients,
  } = useQuery({
    queryKey: ['talkx-recipients-monitor', campaignId, statusFilter],
    queryFn: async () => {
      let q = supabase.from('talkx_recipients')
        .select('*, contacts:contact_id(name, nickname, phone, company, avatar_url)')
        .eq('campaign_id', campaignId).order('updated_at', { ascending: false }).limit(200);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TalkXRecipient[];
    },
    refetchInterval: REFETCH,
  });
  const recipients = recipientsData ?? [];

  useEffect(() => {
    const ch = supabase.channel(`talkx-mon-${campaignId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'talkx_campaigns', filter: `id=eq.${campaignId}` }, () => qc.invalidateQueries({ queryKey: ['talkx-campaign-live', campaignId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talkx_recipients', filter: `campaign_id=eq.${campaignId}` }, () => qc.invalidateQueries({ queryKey: ['talkx-recipients-monitor', campaignId, statusFilter] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId, statusFilter, qc]);

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
  // X148/TL-157 — "pendentes" para a Saúde da Campanha: mesma fórmula do cálculo
  // pré-refactor (total menos o que já foi processado), usando o `processed` que
  // o X051 já mantém nesta função.
  const remaining = campaign ? Math.max(0, campaign.total_recipients - processed) : 0;

  // Real rate data from hook (E02) — replaced Math.random with actual DB data
  const { rateByMinute: chartData, isLoading: rateLoading, isError: rateError, refetch: refetchRate } = useTalkXMonitor(campaignId, statusFilter);

  // X148 — "Saúde da Campanha": o último envio e a taxa por minuto saem dos envios da
  // campanha INTEIRA. A consulta acima recebe o filtro de status da aba de destinatários;
  // medir saúde com ela mostraria "Envio parado" só porque o operador filtrou "falhas"
  // (mesmo motivo pelo qual o gráfico de ritmo também não deve receber esse filtro).
  // Com o filtro em "Todos" as duas consultas usam a MESMA chave e o React Query faz um
  // único pedido.
  const {
    recipients: healthRecipients,
    isLoading: healthLoading,
    isError: healthError,
  } = useTalkXMonitor(campaignId);
  const healthSentAts = useMemo(() => (healthRecipients ?? []).map((r) => r.sent_at), [healthRecipients]);
  // Sem a medida (consulta carregando ou falhou) o card NÃO acusa "Envio parado": erro de
  // consulta não é o mesmo que campanha parada. Ele mostra o estado pelo status e "—" na taxa.
  const healthMeasured = !healthLoading && !healthError;

  // N-097: pré-checagem de retomada no servidor, só com a campanha pausada (antes do return antecipado).
  const { precheck: serverPrecheck } = useTalkXServerResumePrecheck(campaign ?? null);

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
      {isPaused && <TalkXServerResumePrecheck precheck={serverPrecheck} />}

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
          <TalkXHealthCard
            status={campaign.status}
            pauseReason={campaignPauseReason(campaign)}
            // Sem nenhum envio ainda, a atividade de referência é o próprio início da
            // campanha: parada é não enviar desde que começou.
            lastActivityAt={healthMeasured ? (talkxLastSentAt(healthSentAts) ?? campaign.started_at) : null}
            pending={remaining}
            stalledAfterMs={talkxStallWindowMs(campaign.send_interval_max, campaign.typing_delay_max)}
            connectionLabel={connStatusLabel}
            ratePerMinute={healthMeasured ? talkxRatePerMinute(healthSentAts) : null}
            startedAt={campaign.started_at}
            onOpenHelp={onOpenHelp}
          />
        </div>
      )}

      {tab==='recipients' && (
        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <p className="text-sm font-bold text-foreground">Destinatários</p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-auto bg-input/40 border-border/70 text-xs min-w-[130px]"><SelectValue placeholder="Todos"/></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(RECIPIENT_STATUS).map(([v,m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <TalkXQueryBoundary
            query={{ isLoading: recipientsLoading, isError: recipientsError, error: recipientsErrorObj }}
            entity="listas de destinatários"
            onRetry={() => refetchRecipients()}
            skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
            isEmpty={recipients.length === 0}
            empty={<div className="py-4"><TalkXEmptyState icon={Inbox} title="Nenhum destinatário encontrado" description="Ajuste o filtro de status ou aguarde os primeiros envios." /></div>}
          >
            <div className="max-h-[480px] overflow-auto divide-y divide-border/40">
              {recipients.map((r,i) => {
                const sm = RECIPIENT_STATUS[r.status]??RECIPIENT_STATUS.pending;
                return (
                  <motion.div key={r.id} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:Math.min(i*.02,.4)}} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                    <InitialsAvatar name={r.contacts?.name||'?'} src={r.contacts?.avatar_url} size={32}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{r.contacts?.name||'Desconhecido'}</p>
                      {r.personalized_message && <p className="text-2xs text-foreground-secondary truncate">{r.personalized_message}</p>}
                      {r.error_message && <p className="text-2xs text-dash-red truncate">{r.error_message}</p>}
                    </div>
                    <Pill label={sm.label} tone={sm.tone}/>
                    {r.sent_at && <span className="text-3xs text-muted-foreground shrink-0">{fmtAgo(r.sent_at)}</span>}
                  </motion.div>
                );
              })}
            </div>
          </TalkXQueryBoundary>
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
