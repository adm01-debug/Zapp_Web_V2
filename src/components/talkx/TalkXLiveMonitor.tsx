import { toast } from 'sonner';
import React, { useEffect, useState, useMemo } from 'react';
import {
  Pause, Square, Play, Download, Timer, Send, CheckCircle2, XCircle, Clock, Loader2,
  SkipForward, BarChart3, Activity, RefreshCw, Zap,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { useTalkXMonitor } from '@/hooks/integrations/useTalkXMonitor';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pill, InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign, TalkXRecipient } from '@/hooks/integrations/useTalkX';
import { useTalkX } from '@/hooks/integrations/useTalkX';
import { useTalkXEvents } from '@/hooks/integrations/useTalkXEvents';
import { IconTile, RailCard, MetaRow, StatusPill, CAMPAIGN_STATUS, RECIPIENT_STATUS, fmtInt, pct, fmtDateTime, fmtAgo } from './talkxShared';
import { exportRecipientsCsv, type RecipientRow } from '@/lib/talkxExport';

interface Props { campaignId: string; onBack?: () => void }
type MonitorTab = 'overview' | 'recipients' | 'timeline';
const REFETCH = 4000;

export function TalkXLiveMonitor({ campaignId, onBack }: Props) {
  const qc = useQueryClient();
  const { startCampaign, pauseCampaign, cancelCampaign } = useTalkX();
  const { events, logEvent } = useTalkXEvents(campaignId);
  const [tab, setTab] = useState<MonitorTab>('overview');
  const [statusFilter, setStatusFilter] = useState('all');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);

  const { data: campaign, isFetching } = useQuery({
    queryKey: ['talkx-campaign-live', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from('talkx_campaigns').select('*').eq('id', campaignId).single();
      if (error) throw error;
      return data as TalkXCampaign;
    },
    refetchInterval: REFETCH,
  });

  const { data: recipients = [] } = useQuery({
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

  const progress = campaign && campaign.total_recipients > 0 ? pct(campaign.sent_count + campaign.failed_count, campaign.total_recipients) : 0;
  const remaining = campaign ? campaign.total_recipients - campaign.sent_count - campaign.failed_count : 0;
  const successRate = campaign && campaign.sent_count + campaign.failed_count > 0 ? pct(campaign.sent_count, campaign.sent_count + campaign.failed_count) : 0;

  // Real rate data from hook (E02) — replaced Math.random with actual DB data
  const { rateByMinute: chartData } = useTalkXMonitor(campaignId, statusFilter);

  const handleExport = async () => {
    // P1 fix: pagina em lotes de 1000 ate esgotar os destinatarios
    const PAGE = 1000;
    let offset = 0;
    const allRows: RecipientRow[] = [];
    for (;;) {
      const { data, error } = await fromTable('talkx_recipients')
        .select('status, sent_at, delivered_at, error_message, personalized_message, contacts:contact_id(name, phone)')
        .eq('campaign_id', campaignId).order('created_at').order('id').range(offset, offset + PAGE - 1);
      if (error) { console.warn('[export] page error:', error.message); return; } // aborta: nao exporta parcial
      if (!data?.length) break;
      allRows.push(...(data as Record<string, unknown>[]).map((r) => ({
        name: (r.contacts as { name: string } | null)?.name ?? null,
        phone: (r.contacts as { phone: string } | null)?.phone ?? null,
        status: String(r.status ?? ''),
        sent_at: r.sent_at ? String(r.sent_at) : null,
        delivered_at: r.delivered_at ? String(r.delivered_at) : null,
        error_message: r.error_message ? String(r.error_message) : null,
        personalized_message: r.personalized_message ? String(r.personalized_message) : null,
      }) as RecipientRow));
      if (data.length < PAGE) break; // ultima pagina
      offset += PAGE;
    }
    if (allRows.length === 0) return;
    exportRecipientsCsv(allRows, campaign?.name ?? 'campanha');
  };

  if (!campaign) return <div className="space-y-4 animate-pulse">{Array.from({length:3}).map((_,i) => <div key={i} className="h-24 bg-muted rounded-2xl"/>)}</div>;

  const isRunning = campaign.status === 'sending';
  const isPaused = campaign.status === 'paused';
  const isDone = campaign.status === 'completed' || campaign.status === 'cancelled';

  return (
    <div className="space-y-4 min-w-0">
      <div className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile icon={isRunning ? Zap : isPaused ? Pause : CheckCircle2} color={isRunning ? 'blue' : isPaused ? 'amber' : 'green'} size={48} />
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold text-foreground truncate">{campaign.name}</h2>
              <p className="text-[12.5px] text-foreground-secondary line-clamp-1">{campaign.message_template}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {elapsed && <span className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-border/70 bg-input/40"><Timer className="w-3.5 h-3.5 text-muted-foreground"/>{elapsed}</span>}
            <StatusPill status={campaign.status} map={CAMPAIGN_STATUS}/>
            {isFetching && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin"/>}
            {!isDone && (<>
              {isRunning && <button type="button" onClick={()=>setConfirmPause(true)} className="h-9 px-3.5 rounded-lg border border-dash-amber/40 bg-dash-amber/10 text-dash-amber text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-dash-amber/20"><Pause className="w-4 h-4"/>Pausar</button>}
              {isPaused && <button type="button" onClick={()=>setConfirmResume(true)} className="h-9 px-3.5 rounded-lg border border-primary/40 bg-primary/10 text-primary-glow text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-primary/20"><Play className="w-4 h-4"/>Retomar</button>}
              <button type="button" onClick={()=>setConfirmCancel(true)} className="h-9 px-3.5 rounded-lg border border-dash-red/40 bg-dash-red/10 text-dash-red text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-dash-red/20"><Square className="w-4 h-4"/>Cancelar</button>
            </>)}
            <button type="button" onClick={handleExport} className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-[12.5px] font-medium flex items-center gap-1.5 hover:bg-muted/50"><Download className="w-4 h-4"/>CSV</button>
          </div>
        </div>
        <Progress value={progress} className="h-3 mb-1.5"/>
        <div className="flex items-center justify-between text-[11.5px] text-foreground-secondary">
          <span>{progress}% concluído · {fmtInt(campaign.sent_count + campaign.failed_count)} de {fmtInt(campaign.total_recipients)}</span>
          {isRunning && <span className="text-primary-glow font-medium animate-pulse">Enviando agora…</span>}
          {campaign.completed_at && <span>Concluída em {fmtDateTime(campaign.completed_at)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[{l:'Enviadas',v:fmtInt(campaign.sent_count),I:Send,c:'text-primary'},{l:'Entregues',v:fmtInt(campaign.delivered_count),I:CheckCircle2,c:'text-dash-green'},{l:'Falhas',v:fmtInt(campaign.failed_count),I:XCircle,c:'text-dash-red'},{l:'Restantes',v:fmtInt(remaining),I:Clock,c:'text-foreground-secondary'},{l:'Taxa sucesso',v:successRate+'%',I:BarChart3,c:'text-primary-glow'}].map(({l,v,I,c},i) => (
          <motion.div key={l} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*.05}} className="rounded-xl bg-card border border-border/70 p-3 flex items-center gap-2">
            <I className={cn('w-4 h-4 shrink-0',c)}/><div className="min-w-0"><p className="text-[17px] font-bold text-foreground tabular-nums">{v}</p><p className="text-[10px] text-foreground-secondary truncate">{l}</p></div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-border/60">
        {([['overview','Visão Geral'],['recipients','Destinatários'],['timeline','Linha do Tempo']] as [MonitorTab,string][]).map(([t,l]) => (
          <button key={t} type="button" onClick={()=>setTab(t)} className={cn('h-9 px-3.5 text-[12.5px] font-medium border-b-2 transition-colors',tab===t?'border-primary text-foreground':'border-transparent text-foreground-secondary hover:text-foreground hover:border-border')}>{l}</button>
        ))}
      </div>

      {tab==='overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <section className="rounded-2xl bg-card border border-border/70 p-4">
            <p className="text-[14px] font-bold text-foreground mb-3">Ritmo de Entrega <span className="text-[12px] font-normal text-foreground-secondary ml-1">(últimos 60 min · estimado)</span></p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{top:5,right:5,left:-25,bottom:5}}>
                <defs><linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))"/>
                <YAxis tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))"/>
                <ReTooltip contentStyle={{background:'hsl(var(--popover))',border:'1px solid hsl(var(--border))',borderRadius:12,fontSize:12}}/>
                <Area type="monotone" dataKey="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gS)" dot={false}/>
                <Area type="monotone" dataKey="Entregues" stroke="hsl(var(--dash-green))" strokeWidth={2} fill="none" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </section>
          <RailCard icon={Activity} title="Saúde da Campanha" right={<Pill label={isRunning?'Em andamento':isPaused?'Pausada':'Concluída'} tone={isRunning?'info':isPaused?'warning':'success'} dot/>}>
            <MetaRow label="Status" value={isRunning?'Enviando normalmente':isPaused?'Envio pausado':campaign.status}/>
            <MetaRow label="Conexão WA" value="Conectada"/>
            <MetaRow label="Iniciado em" value={campaign.started_at?fmtDateTime(campaign.started_at):'—'}/>
          </RailCard>
        </div>
      )}

      {tab==='recipients' && (
        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <p className="text-[14px] font-bold text-foreground">Destinatários</p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-auto bg-input/40 border-border/70 text-[12px] min-w-[130px]"><SelectValue placeholder="Todos"/></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(RECIPIENT_STATUS).map(([v,m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-h-[480px] overflow-auto divide-y divide-border/40">
            {recipients.map((r,i) => {
              const sm = RECIPIENT_STATUS[r.status]??RECIPIENT_STATUS.pending;
              return (
                <motion.div key={r.id} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:Math.min(i*.02,.4)}} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                  <InitialsAvatar name={r.contacts?.name||'?'} src={r.contacts?.avatar_url} size={32}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{r.contacts?.name||'Desconhecido'}</p>
                    {r.personalized_message && <p className="text-[11.5px] text-foreground-secondary truncate">{r.personalized_message}</p>}
                    {r.error_message && <p className="text-[11.5px] text-dash-red truncate">{r.error_message}</p>}
                  </div>
                  <Pill label={sm.label} tone={sm.tone}/>
                  {r.sent_at && <span className="text-[10.5px] text-muted-foreground shrink-0">{fmtAgo(r.sent_at)}</span>}
                </motion.div>
              );
            })}
            {recipients.length===0 && <p className="text-center py-8 text-muted-foreground text-[12.5px]">Nenhum destinatário encontrado</p>}
          </div>
        </section>
      )}

      {tab==='timeline' && (
        <section className="rounded-2xl bg-card border border-border/70 p-4">
          <p className="text-[15px] font-bold text-foreground mb-3">Linha do Tempo Operacional</p>
          <div className="space-y-0">
            {events.map((ev,i) => (
              <div key={ev.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={cn('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0',ev.event_type==='started'?'bg-primary':ev.event_type==='completed'?'bg-dash-green':ev.event_type==='paused'?'bg-dash-amber':ev.event_type==='cancelled'?'bg-dash-red':'bg-border')}/>
                  {i<events.length-1 && <div className="w-px flex-1 bg-border/50 my-0.5"/>}
                </div>
                <div className="pb-3 min-w-0">
                  <p className="text-[12.5px] font-medium text-foreground">{ev.message||ev.event_type}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtDateTime(ev.created_at)}{ev.actor?.name?` · ${ev.actor.name}`:''}</p>
                </div>
              </div>
            ))}
            {events.length===0 && <p className="text-[12.5px] text-muted-foreground">Nenhum evento registrado ainda.</p>}
          </div>
        </section>
      )}

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent className="rounded-2xl border-border/70"><AlertDialogHeader><AlertDialogTitle>Pausar campanha?</AlertDialogTitle><AlertDialogDescription>Os envios em andamento serão concluídos, mas novos envios não serão iniciados.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-dash-amber hover:bg-dash-amber/90 text-black" onClick={async(ev: React.MouseEvent)=>{ev.preventDefault(); try { await pauseCampaign(campaignId); await logEvent(campaignId,'paused'); setConfirmPause(false); } catch(e: unknown) { toast.error(`Erro ao pausar: ${e instanceof Error ? (e as Error).message : 'Erro'}`); }}}>Pausar agora</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent className="rounded-2xl border-border/70"><AlertDialogHeader><AlertDialogTitle>Cancelar campanha?</AlertDialogTitle><AlertDialogDescription>O envio será interrompido e contatos pendentes não receberão mensagens.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction className="bg-dash-red hover:bg-dash-red/90 text-white" onClick={async(ev: React.MouseEvent)=>{ev.preventDefault(); try { await cancelCampaign(campaignId); await logEvent(campaignId,'cancelled'); setConfirmCancel(false); } catch(e: unknown) { toast.error(`Erro ao cancelar: ${e instanceof Error ? (e as Error).message : 'Erro'}`); }}}>Cancelar campanha</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmResume} onOpenChange={setConfirmResume}>
        <AlertDialogContent className="rounded-2xl border-border/70"><AlertDialogHeader><AlertDialogTitle>Retomar campanha?</AlertDialogTitle><AlertDialogDescription>Os envios serão continuados a partir de onde pararam.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async()=>{const started=await startCampaign(campaignId);if(!started)return;await logEvent(campaignId,'resumed');setConfirmResume(false);}}>Retomar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
