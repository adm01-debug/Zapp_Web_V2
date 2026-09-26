import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pause, Play, Square, Send, XCircle, AlertTriangle, Clock, BarChart3, Download, ArrowLeft } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import {
  useMultiplixDispatch, useMultiplixRecipients, useMultiplixDispatchAction,
} from '@/hooks/integrations/useMultiplixDispatches';
import {
  IconTile, StatusPill, fmtInt, pct, fmtDateTime,
} from '@/components/talkx/talkxShared';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const DISPATCH_STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'muted' }> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  scheduled: { label: 'Agendado', tone: 'violet' },
  sending: { label: 'Enviando', tone: 'info' },
  paused: { label: 'Pausado', tone: 'warning' },
  completed: { label: 'Concluído', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const RECIPIENT_STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'muted' }> = {
  pending: { label: 'Na fila', tone: 'muted' },
  sending: { label: 'Enviando', tone: 'info' },
  sent: { label: 'Enviada', tone: 'success' },
  delivered: { label: 'Entregue', tone: 'success' },
  failed: { label: 'Falha', tone: 'danger' },
  outcome_unknown: { label: 'A confirmar', tone: 'warning' },
  skipped: { label: 'Sem WhatsApp', tone: 'muted' },
};

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r\n＝＋－＠]/u;

function exportRecipientsCsv(rows: { company_name_snapshot: string | null; destino_e164: string | null; status: string; sent_at: string | null; error_message: string | null }[], dispatchName: string) {
  if (rows.length === 0) return;
  const esc = (v: string) => {
    const safe = CSV_FORMULA_PREFIX.test(v) ? `'${v}` : v;
    return /[,"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const cols: Array<[string, (r: (typeof rows)[number]) => string]> = [
    ['Empresa', (r) => r.company_name_snapshot ?? ''],
    ['Telefone', (r) => r.destino_e164 ?? ''],
    ['Status', (r) => r.status],
    ['Enviada em', (r) => r.sent_at ?? ''],
    ['Erro', (r) => r.error_message ?? ''],
  ];
  const lines = [cols.map(([h]) => h).join(','), ...rows.map((r) => cols.map(([, f]) => esc(f(r))).join(','))].join('\n');
  const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `multiplix-${dispatchName.replace(/[^\w\s-]/g, '').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props { dispatchId: string; onBack: () => void }

export function MultiplixMonitor({ dispatchId, onBack }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);

  const { data: dispatch } = useMultiplixDispatch(dispatchId);
  const { data: recipients = [] } = useMultiplixRecipients(dispatchId, statusFilter);
  const action = useMultiplixDispatchAction();

  // total_recipients/sent_count/failed_count/outcome_unknown_count nao contam
  // 'skipped' (empresa sem WhatsApp) -- sem isso, um disparo com destinatarios
  // pulados nunca chega a 100% e "Restantes" fica preso contando quem ja foi
  // resolvido como sem destino.
  const { data: skippedCount = 0 } = useQuery({
    queryKey: ['multiplix-skipped-count', dispatchId],
    queryFn: async () => {
      const { count, error } = await fromTable('multiplix_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('dispatch_id', dispatchId)
        .eq('status', 'skipped');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!dispatchId,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    const ch = supabase.channel(`multiplix-mon-${dispatchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'multiplix_dispatches', filter: `id=eq.${dispatchId}` }, () => qc.invalidateQueries({ queryKey: ['multiplix-dispatch', dispatchId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplix_recipients', filter: `dispatch_id=eq.${dispatchId}` }, () => qc.invalidateQueries({ queryKey: ['multiplix-recipients', dispatchId, statusFilter] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [dispatchId, statusFilter, qc]);

  const runAction = async (a: 'start' | 'pause' | 'cancel') => {
    try {
      await action.mutateAsync({ dispatchId, action: a });
      qc.invalidateQueries({ queryKey: ['multiplix-dispatch', dispatchId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar disparo');
    }
  };

  if (!dispatch) return <div className="space-y-4 animate-pulse">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-2xl" />)}</div>;

  const outcomeUnknown = dispatch.outcome_unknown_count ?? 0;
  const processed = dispatch.sent_count + dispatch.failed_count + outcomeUnknown + skippedCount;
  const progress = dispatch.total_recipients > 0 ? pct(processed, dispatch.total_recipients) : 0;
  const remaining = Math.max(0, dispatch.total_recipients - processed);
  const successRate = processed > 0 ? pct(dispatch.sent_count, processed) : 0;
  const isRunning = dispatch.status === 'sending';
  const isPaused = dispatch.status === 'paused';
  const isDraft = dispatch.status === 'draft' || dispatch.status === 'scheduled';
  const canStart = isPaused || isDraft;
  const isDone = dispatch.status === 'completed' || dispatch.status === 'cancelled' || dispatch.status === 'failed';

  return (
    <div className="space-y-4 min-w-0">
      <button type="button" onClick={onBack} className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bg-muted/50 w-fit">
        <ArrowLeft className="w-4 h-4" />Voltar aos disparos
      </button>

      <div className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile icon={isRunning ? Send : isPaused ? Pause : XCircle} color={isRunning ? 'blue' : isPaused ? 'amber' : dispatch.status === 'completed' ? 'green' : 'red'} size={48} />
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{dispatch.name}</h2>
              <p className="text-xs text-foreground-secondary line-clamp-1">{dispatch.message_template}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <StatusPill status={dispatch.status} map={DISPATCH_STATUS} />
            {!isDone && (<>
              {isRunning && <button type="button" onClick={() => setConfirmPause(true)} className="h-9 px-3.5 rounded-lg border border-dash-amber/40 bg-dash-amber/10 text-dash-amber text-xs font-semibold flex items-center gap-1.5 hover:bg-dash-amber/20"><Pause className="w-4 h-4" />Pausar</button>}
              {canStart && <button type="button" onClick={() => setConfirmResume(true)} className="h-9 px-3.5 rounded-lg border border-primary/40 bg-primary/10 text-primary-glow text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/20"><Play className="w-4 h-4" />{isPaused ? 'Retomar' : 'Iniciar'}</button>}
              <button type="button" onClick={() => setConfirmCancel(true)} className="h-9 px-3.5 rounded-lg border border-dash-red/40 bg-dash-red/10 text-dash-red text-xs font-semibold flex items-center gap-1.5 hover:bg-dash-red/20"><Square className="w-4 h-4" />Cancelar</button>
            </>)}
            <button type="button" onClick={() => exportRecipientsCsv(recipients, dispatch.name)} className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium flex items-center gap-1.5 hover:bg-muted/50"><Download className="w-4 h-4" />CSV</button>
          </div>
        </div>
        <Progress value={progress} className="h-3 mb-1.5" />
        <div className="flex items-center justify-between text-2xs text-foreground-secondary">
          <span>{progress}% concluído · {fmtInt(processed)} de {fmtInt(dispatch.total_recipients)}</span>
          {isRunning && <span className="text-primary-glow font-medium animate-pulse">Enviando agora…</span>}
          {dispatch.completed_at && <span>Concluído em {fmtDateTime(dispatch.completed_at)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: 'Enviadas', v: fmtInt(dispatch.sent_count), I: Send, c: 'text-primary' },
          { l: 'Falhas', v: fmtInt(dispatch.failed_count), I: XCircle, c: 'text-dash-red' },
          { l: 'A confirmar', v: fmtInt(outcomeUnknown), I: AlertTriangle, c: 'text-dash-amber' },
          { l: 'Restantes', v: fmtInt(remaining), I: Clock, c: 'text-foreground-secondary' },
        ].map(({ l, v, I, c }) => (
          <div key={l} className="rounded-xl bg-card border border-border/70 p-3 flex items-center gap-2">
            <I className={`w-4 h-4 shrink-0 ${c}`} /><div className="min-w-0"><p className="text-lg font-bold text-foreground tabular-nums">{v}</p><p className="text-3xs text-foreground-secondary truncate">{l}</p></div>
          </div>
        ))}
      </div>
      {processed > 0 && (
        <p className="text-xs text-foreground-secondary flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Taxa de sucesso: <strong className="text-foreground">{successRate}%</strong></p>
      )}

      <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <p className="text-sm font-bold text-foreground">Destinatários</p>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-auto bg-input/40 border-border/70 text-xs min-w-[130px]"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(RECIPIENT_STATUS).map(([v, m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="max-h-[480px] overflow-auto divide-y divide-border/40">
          {recipients.map((r) => {
            const sm = RECIPIENT_STATUS[r.status] ?? RECIPIENT_STATUS.pending;
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{r.company_name_snapshot || 'Empresa'}</p>
                  <p className="text-2xs text-foreground-secondary truncate">{r.destino_e164 ?? 'sem WhatsApp'}</p>
                  {r.error_message && <p className="text-2xs text-dash-red truncate">{r.error_message}</p>}
                </div>
                <StatusPill status={r.status} map={RECIPIENT_STATUS} />
                {r.sent_at && <span className="text-3xs text-muted-foreground shrink-0">{fmtDateTime(r.sent_at)}</span>}
              </div>
            );
          })}
          {recipients.length === 0 && <p className="text-center py-8 text-muted-foreground text-xs">Nenhum destinatário encontrado</p>}
        </div>
      </section>

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Pausar disparo?</AlertDialogTitle><AlertDialogDescription>Envios em andamento serão concluídos, mas novos não serão iniciados.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { await runAction('pause'); setConfirmPause(false); }}>Pausar agora</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancelar disparo?</AlertDialogTitle><AlertDialogDescription>O envio será interrompido e destinatários pendentes não receberão mensagens.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={async () => { await runAction('cancel'); setConfirmCancel(false); }}>Cancelar disparo</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmResume} onOpenChange={setConfirmResume}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{isPaused ? 'Retomar disparo?' : 'Iniciar disparo?'}</AlertDialogTitle><AlertDialogDescription>{isPaused ? 'O envio continua de onde parou.' : 'Isso envia mensagens reais no WhatsApp para os destinatários deste disparo — sem volta.'}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { await runAction('start'); setConfirmResume(false); }}>{isPaused ? 'Retomar' : 'Iniciar agora'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
