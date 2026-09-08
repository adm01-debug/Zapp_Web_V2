import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Clock, Download, MessageSquare, FileText, ArrowLeftRight, UserPlus, Paperclip, CheckSquare,
  DollarSign, XCircle, RotateCcw, Activity, CalendarClock, CheckCircle2, type LucideIcon,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatRelativeTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  useConversationHistoryTimeline, type TimelineEvent, type TimelineEventKind, type TimelineTypeFilter,
} from '@/hooks/chat/useConversationHistoryTimeline';
import { KpiStrip } from './KpiStrip';

interface HistoryTabProps {
  contactId: string;
}

const KIND_META: Record<TimelineEventKind, { icon: LucideIcon; className: string }> = {
  message_in: { icon: MessageSquare, className: 'bg-primary/15 text-primary' },
  message_out: { icon: MessageSquare, className: 'bg-primary/15 text-primary' },
  note: { icon: FileText, className: 'bg-primary/15 text-primary' },
  transfer: { icon: ArrowLeftRight, className: 'bg-success/15 text-success' },
  assign: { icon: UserPlus, className: 'bg-success/15 text-success' },
  file: { icon: Paperclip, className: 'bg-muted/60 text-muted-foreground' },
  task: { icon: CheckSquare, className: 'bg-warning/15 text-warning' },
  deal: { icon: DollarSign, className: 'bg-success/15 text-success' },
  close: { icon: XCircle, className: 'bg-muted/60 text-muted-foreground' },
  reopen: { icon: RotateCcw, className: 'bg-success/15 text-success' },
};

const PILL_CLASS: Record<string, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  primary: 'bg-primary/15 text-primary border-primary/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
  muted: 'bg-muted text-muted-foreground border-border',
};

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '0', label: 'Tudo' },
];

const TYPE_OPTIONS: { value: TimelineTypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'messages', label: 'Mensagens' },
  { value: 'notes', label: 'Notas' },
  { value: 'tasks', label: 'Tarefas' },
  { value: 'transfers', label: 'Transferências' },
  { value: 'files', label: 'Arquivos' },
  { value: 'deals', label: 'Propostas' },
];

function formatAvgResponse(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const rest = Math.round(min % 60);
  return `${h}h ${rest}min`;
}

function dayLabel(dateStr: string): string {
  const today = new Date();
  const date = new Date(`${dateStr}T00:00:00`);
  const isToday = date.toDateString() === today.toDateString();
  const formatted = format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return isToday ? `Hoje, ${formatted}` : formatted;
}

function exportTimeline(events: TimelineEvent[]) {
  const header = 'data;hora;tipo;titulo;subtitulo';
  const rows = events.map((e) => {
    const d = new Date(e.at);
    return [format(d, 'dd/MM/yyyy'), format(d, 'HH:mm'), e.kind, e.title, e.subtitle ?? ''].join(';');
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico-conversa-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Aba Histórico (2.10) — cabeçalho + filtros + KPIs + timeline agrupada por dia. */
export function HistoryTab({ contactId }: HistoryTabProps) {
  const [period, setPeriod] = useState<'7' | '30' | '90' | '0'>('30');
  const [type, setType] = useState<TimelineTypeFilter>('all');
  const [limit, setLimit] = useState(200);

  const periodValue = Number(period) as 7 | 30 | 90 | 0;
  const { data, isLoading } = useConversationHistoryTimeline(contactId, periodValue, type, limit);

  const days = useMemo(() => data?.days ?? [], [data?.days]);
  const metrics = data?.metrics;
  const hasMore = data?.hasMore ?? false;
  const allEvents = useMemo(() => days.flatMap((d) => d.events), [days]);

  return (
    <div className="flex flex-col gap-4" data-testid="history-tab">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0"><Clock className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-foreground">Histórico da Conversa</h2>
          <p className="text-sm text-muted-foreground">Acompanhe toda a jornada de relacionamento com este contato.</p>
        </div>
        <button
          type="button"
          onClick={() => exportTimeline(allEvents)}
          disabled={allEvents.length === 0}
          className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar histórico
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>{PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as TimelineTypeFilter)}>
          <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>{TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <KpiStrip
        cells={[
          { icon: Activity, label: 'Total de interações', value: metrics?.total ?? '—' },
          { icon: CalendarClock, label: 'Último contato', value: metrics?.lastContactAt ? formatRelativeTime(metrics.lastContactAt) : '—' },
          { icon: Clock, label: 'Tempo médio de resposta', value: formatAvgResponse(metrics?.avgResponseMin ?? null) },
          { icon: CheckCircle2, label: 'Resoluções', value: metrics?.resolutions ?? '—' },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : days.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhum evento neste período.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => (
            <div key={day.date} className="flex flex-col gap-2">
              <span className="self-start h-7 px-3 rounded-full bg-muted/40 border border-border text-xs font-medium text-muted-foreground capitalize">
                {dayLabel(day.date)}
              </span>
              <div className="relative pl-14">
                <div className="absolute left-[27px] top-1 bottom-1 w-px bg-border" />
                <div className="flex flex-col gap-3">
                  {day.events.map((event) => {
                    const meta = KIND_META[event.kind];
                    const Icon = meta.icon;
                    return (
                      <div key={event.id} data-testid="timeline-event" className="relative flex items-start gap-3">
                        <span className="absolute -left-14 top-1 w-11 text-right text-xs text-muted-foreground shrink-0">
                          {format(new Date(event.at), 'HH:mm')}
                        </span>
                        <span className="absolute left-[-1px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
                        <div className="flex-1 rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', meta.className)}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate">{event.title}</p>
                            {event.subtitle && <p className="text-xs text-muted-foreground truncate">{event.subtitle}</p>}
                          </div>
                          {event.pill && (
                            <span className={cn('h-6 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center shrink-0', PILL_CLASS[event.pill.tone])}>
                              {event.pill.label}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 200)}
              className="self-center h-9 px-4 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
