import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, PauseCircle, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useInstancePauses, type InstancePause } from '@/hooks/connections/useInstancePauses';
import { buildPauseSeries, isPauseActive, type PauseWindow } from '@/lib/instancePauseSeries';

interface PanelConnection {
  id: string;
  name: string;
  instance_id: string | null;
}

const MIN_MINUTES = 5;
const MAX_MINUTES = 1440;
const HISTORY_SHOWN = 10;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

function PauseSeries({ rows, now }: { rows: InstancePause[]; now: number }) {
  const [window, setWindow] = useState<PauseWindow>('24h');
  const buckets = useMemo(() => buildPauseSeries(rows, window, now), [rows, window, now]);
  const max = Math.max(1, ...buckets.map((b) => b.manual + b.auto));
  const total = buckets.reduce((s, b) => s + b.manual + b.auto, 0);
  const label = (start: number) =>
    window === '24h'
      ? new Date(start).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit' }) + 'h'
      : new Date(start).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

  return (
    <div data-testid="pause-series" className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total === 0 ? 'Nenhuma pausa no período' : `${total} pausa(s) no período (manuais e automáticas)`}
        </p>
        <div className="flex gap-1" role="group" aria-label="Janela da série">
          {(['24h', '7d'] as const).map((w) => (
            <Button key={w} size="sm" variant={window === w ? 'default' : 'outline'} aria-pressed={window === w} onClick={() => setWindow(w)}>
              {w === '24h' ? '24 horas' : '7 dias'}
            </Button>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Pausas por {window === '24h' ? 'hora' : 'dia'}</caption>
        <thead><tr><th scope="col">Período</th><th scope="col">Manuais</th><th scope="col">Automáticas</th></tr></thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.start}><th scope="row">{label(b.start)}</th><td>{b.manual}</td><td>{b.auto}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-end gap-1 h-24" aria-hidden="true">
        {buckets.map((b) => {
          const n = b.manual + b.auto;
          return (
            <div key={b.start} className="flex-1 flex flex-col justify-end h-full" title={`${label(b.start)}: ${b.manual} manual, ${b.auto} automática`}>
              <div className="w-full bg-destructive/70 rounded-t-sm" style={{ height: `${(b.auto / max) * 100}%` }} />
              <div className="w-full bg-primary/70" style={{ height: `${(b.manual / max) * 100}%` }} />
              {n === 0 && <div className="w-full h-px bg-border" />}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label(buckets[0].start)}</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1"><i className="inline-block w-2 h-2 bg-primary/70" />manual</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2 h-2 bg-destructive/70" />automática</span>
        </span>
        <span>{label(buckets[buckets.length - 1].start)}</span>
      </div>
    </div>
  );
}

export function InstancePausesPanel({ connections }: { connections: PanelConnection[] }) {
  const { isSupervisor } = useUserRole();
  const { data, dataUpdatedAt, isLoading, isError, pause, resume } = useInstancePauses(isSupervisor);
  const [target, setTarget] = useState<PanelConnection | null>(null);
  const [minutes, setMinutes] = useState('30');
  const [reason, setReason] = useState('');

  const rows = useMemo(() => data ?? [], [data]);
  // relógio vivo (15s): pausa que vence entre leituras deixa de aparecer como ativa
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);
  const activeByInstance = useMemo(() => {
    const map = new Map<string, InstancePause>();
    for (const r of rows) if (isPauseActive(r, now) && !map.has(r.instance)) map.set(r.instance, r);
    return map;
  }, [rows, now]);

  if (!isSupervisor) return null;

  const withInstance = connections.filter((c) => c.instance_id);
  const minutesNum = Number(minutes);
  const minutesValid = Number.isInteger(minutesNum) && minutesNum >= MIN_MINUTES && minutesNum <= MAX_MINUTES;
  const closeDialog = () => { setTarget(null); setReason(''); setMinutes('30'); };

  const submitPause = () => {
    if (!target?.instance_id || !minutesValid || !reason.trim()) return;
    pause.mutate(
      { instance: target.instance_id, minutes: minutesNum, reason: reason.trim() },
      {
        onSuccess: () => { toast.success(`Envios pausados em ${target.name}`); closeDialog(); },
        onError: (e) => toast.error('Não foi possível pausar', { description: e instanceof Error ? e.message : 'Erro desconhecido' }),
      },
    );
  };

  const submitResume = (c: PanelConnection) => {
    if (!c.instance_id) return;
    resume.mutate(c.instance_id, {
      onSuccess: () => toast.success(`Envios retomados em ${c.name}`),
      onError: (e) => toast.error('Não foi possível retomar', { description: e instanceof Error ? e.message : 'Erro desconhecido' }),
    });
  };

  const nameOf = (instance: string) => connections.find((c) => c.instance_id === instance)?.name ?? instance;

  return (
    <Card data-testid="instance-pauses-panel" className="border border-secondary/20 bg-card">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><PauseCircle className="w-4 h-4" />Pausa de envios por instância</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando pausas...</div>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">Não foi possível carregar as pausas. Tente recarregar a página.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {withInstance.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma conexão com instância.</li>}
              {withInstance.map((c) => {
                const active = activeByInstance.get(c.instance_id as string);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {active ? (
                        <>
                          <Badge variant="destructive">Pausada até {fmtDateTime(active.paused_until)}</Badge>
                          <Button size="sm" variant="outline" disabled={resume.isPending} onClick={() => submitResume(c)}>
                            <PlayCircle className="w-4 h-4 mr-1" />Retomar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Badge variant="outline">Enviando</Badge>
                          <Button size="sm" variant="outline" onClick={() => setTarget(c)}>
                            <PauseCircle className="w-4 h-4 mr-1" />Pausar
                          </Button>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            <PauseSeries rows={rows} now={now || dataUpdatedAt} />

            <div>
              <p className="text-sm font-medium mb-2">Últimas pausas</p>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma pausa registrada nos últimos 7 dias.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {rows.slice(0, HISTORY_SHOWN).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.auto ? 'destructive' : 'secondary'}>{r.auto ? 'Automática' : 'Manual'}</Badge>
                      <span className="font-medium">{nameOf(r.instance)}</span>
                      <span className="text-muted-foreground">{fmtDateTime(r.created_at)} — {r.reason}</span>
                      {r.resumed_at !== null && <span className="text-muted-foreground">(retomada {fmtDateTime(r.resumed_at)})</span>}
                      {r.resumed_at === null && Date.parse(r.paused_until) <= now && <span className="text-muted-foreground">(expirada)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={target !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pausar envios — {target?.name}</DialogTitle>
            <DialogDescription>Envios feitos pela API de envio (ações do atendente) são bloqueados até o fim da pausa ou até você retomar. Campanhas e a fila de entrega ainda não respeitam a pausa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pause-minutes">Duração (minutos, {MIN_MINUTES} a {MAX_MINUTES})</Label>
              <Input id="pause-minutes" type="number" min={MIN_MINUTES} max={MAX_MINUTES} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              {!minutesValid && <p role="alert" className="text-xs text-destructive">Informe de {MIN_MINUTES} a {MAX_MINUTES} minutos.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pause-reason">Motivo</Label>
              <Input id="pause-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: manutenção do número" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={pause.isPending}>Cancelar</Button>
              <Button onClick={submitPause} disabled={pause.isPending || !minutesValid || !reason.trim()}>
                {pause.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Pausando...</> : 'Pausar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
