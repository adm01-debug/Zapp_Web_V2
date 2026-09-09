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
  message_in: { icon: MessageSquare, className: 'bg-kpi-blue text-kpi-blue-fg' },
  message_out: { icon: MessageSquare, className: 'bg-kpi-blue text-kpi-blue-fg' },
  note: { icon: FileText, className: 'bg-kpi-purple text-kpi-purple-fg' },
  transfer: { icon: ArrowLeftRight, className: 'bg-kpi-green text-kpi-green-fg' },
  assign: { icon: UserPlus, className: 'bg-kpi-green text-kpi-green-fg' },
  file: { icon: Paperclip, className: 'bg-kpi-blue text-kpi-blue-fg' },
  task: { icon: CheckSquare, className: 'bg-kpi-yellow text-kpi-yellow-fg' },
  deal: { icon: DollarSign, className: 'bg-kpi-green text-kpi-green-fg' },
  close: { icon: XCircle, className: 'bg-muted text-muted-foreground' },
  reopen: { icon: RotateCcw, className: 'bg-kpi-green text-kpi-green-fg' },
};

const DOT_CLASS: Record<TimelineEventKind, string> = {
  message_in: 'bg-kpi-blue-fg',
  message_out: 'bg-kpi-blue-fg',
  note: 'bg-kpi-purple-fg',
  transfer: 'bg-kpi-green-fg',
  assign: 'bg-kpi-green-fg',
  file: 'bg-kpi-blue-fg',
  task: 'bg-kpi-yellow-fg',
  deal: 'bg-kpi-green-fg',
  close: 'bg-muted-foreground',
  reopen: 'bg-kpi-green-fg',
};

type PillTone = NonNullable<TimelineEvent['pill']>['tone'];

const PILL_CLASS: Record<PillTone, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  primary: 'bg-primary/15 text-primary',
  destructive: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

const KIND_PILL: Record<TimelineEventKind, { label: string; tone: PillTone }> = {
  message_in: { label: 'Recebida', tone: 'primary' },
  message_out: { label: 'Enviada', tone: 'primary' },
  note: { label: 'Nota', tone: 'primary' },
  transfer: { label: 'Transferência', tone: 'muted' },
  assign: { label: 'Atribuição', tone: 'muted' },
  file: { label: 'Arquivo', tone: 'primary' },
  task: { label: 'Tarefa', tone: 'warning' },
  deal: { label: 'Negociação', tone: 'success' },
  close: { label: 'Encerrada', tone: 'muted' },
  reopen: { label: 'Reaberta', tone: 'success' },
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

function metricValue(value: string | number, sublabel: string) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[22px] font-bold leading-tight tabular-nums">{value}</span>
      <span className="text-[11px] font-normal leading-tight text-muted-foreground">{sublabel}</span>
    </span>
  );
}

function responseComparison(current: number | null | undefined, previous: number | null | undefined): string {
  if (current == null || previous == null || previous <= 0) return 'Sem comparação anterior';
  const delta = Math.round(((previous - current) / previous) * 100);
  return `${delta >= 0 ? '+' : ''}${delta}% vs. período anterior`;
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportTimeline(events: TimelineEvent[]) {
  const header = 'data;hora;tipo;titulo;subtitulo';
  const rows = events.map((e) => {
    const d = new Date(e.at);
    return [format(d, 'dd/MM/yyyy'), format(d, 'HH:mm'), e.kind, e.title, e.subtitle ?? ''].map(csvCell).join(';');
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
    <div className="flex min-w-0 flex-col gap-4" data-testid="history-tab">
      <header className="flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-kpi-blue text-kpi-blue-fg flex items-center justify-center shrink-0"><Clock className="w-5 h-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-foreground">Histórico da Conversa</h2>
          <p className="text-[13px] text-muted-foreground">Acompanhe toda a jornada de relacionamento com este contato.</p>
        </div>
        <button
          type="button"
          onClick={() => exportTimeline(allEvents)}
          disabled={allEvents.length === 0}
          className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold inline-flex items-center gap-2 shrink-0 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Exportar histórico
        </button>
      </header>

      <div className="flex flex-wrap items-end gap-3" aria-label="Filtros do histórico">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="history-period">
          Período
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger id="history-period" className="h-9 w-[180px] rounded-lg bg-input text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor="history-event-type">
          Tipo de evento
          <Select value={type} onValueChange={(v) => setType(v as TimelineTypeFilter)}>
            <SelectTrigger id="history-event-type" className="h-9 w-[200px] rounded-lg bg-input text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      </div>

      <KpiStrip
        cells={[
          {
            icon: Activity,
            label: 'Total de interações',
            value: metricValue(metrics?.total ?? '—', 'Mensagens, notas e ações'),
            iconClassName: 'bg-kpi-blue text-kpi-blue-fg',
          },
          {
            icon: CalendarClock,
            label: 'Último contato',
            value: metricValue(metrics?.lastContactAt ? formatRelativeTime(metrics.lastContactAt) : '—', 'Última mensagem registrada'),
            iconClassName: 'bg-kpi-green text-kpi-green-fg',
          },
          {
            icon: Clock,
            label: 'Tempo médio de resposta',
            value: metricValue(
              formatAvgResponse(metrics?.avgResponseMin ?? null),
              responseComparison(metrics?.avgResponseMin, metrics?.avgResponsePrevMin),
            ),
            iconClassName: 'bg-kpi-blue text-kpi-blue-fg',
          },
          {
            icon: CheckCircle2,
            label: 'Resoluções',
            value: metricValue(metrics?.resolutions ?? '—', 'Conversas finalizadas'),
            iconClassName: 'bg-kpi-green text-kpi-green-fg',
          },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : days.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhum evento neste período.</p>
      ) : (
        <div className="flex flex-col gap-5" aria-label="Linha do tempo da conversa">
          {days.map((day) => (
            <section key={day.date} className="flex flex-col gap-2" aria-labelledby={`history-day-${day.date}`}>
              <h3 id={`history-day-${day.date}`} className="self-start h-7 px-3 rounded-full bg-muted text-xs font-medium text-muted-foreground capitalize inline-flex items-center">
                {dayLabel(day.date)}
              </h3>
              <ol className="flex flex-col gap-3">
                  {day.events.map((event, eventIndex) => {
                    const meta = KIND_META[event.kind];
                    const Icon = meta.icon;
                    const pill = event.pill ?? KIND_PILL[event.kind];
                    return (
                      <li key={event.id} data-testid="timeline-event" className="grid grid-cols-[44px_20px_minmax(0,1fr)] gap-x-2">
                        <time dateTime={event.at} className="pt-3 text-right text-xs text-muted-foreground">
                          {format(new Date(event.at), 'HH:mm')}
                        </time>
                        <span className="relative flex justify-center" aria-hidden="true">
                          {eventIndex < day.events.length - 1 && <span className="absolute bottom-[-0.75rem] top-5 w-px bg-border" />}
                          <span className={cn('relative mt-3 h-2.5 w-2.5 rounded-full ring-4 ring-background', DOT_CLASS[event.kind])} />
                        </span>
                        <article className="flex min-w-0 items-center gap-3 rounded-[10px] border border-border bg-card p-3">
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', meta.className)}>
                            <Icon className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold">{event.title}</p>
                            {event.subtitle && <p className="truncate text-xs text-muted-foreground">{event.subtitle}</p>}
                          </div>
                          <span className={cn('inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-[11px] font-medium', PILL_CLASS[pill.tone])}>
                            {pill.label}
                          </span>
                        </article>
                      </li>
                    );
                  })}
              </ol>
            </section>
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 200)}
              className="self-center h-9 px-4 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
