import { useRef, useState } from 'react';
import { format, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { weekBuckets, groupAgendaDay, agendaDayCounts, agendaDayAriaLabel } from '@/hooks/tasks/workItemAggregates';
import { WorkItemCard } from '../shared/WorkItemCard';
import { WorkItemCardSkeleton } from '../shared/WorkItemCardSkeleton';
import { QuickAdd } from '../shared/QuickAdd';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemCardActions } from '../shared/cardActions';

interface Props extends WorkItemCardActions {
  items: WorkItem[];
  overdue: WorkItem[];
  isLoading: boolean;
  /** Etapa 57: o QuickAdd da Agenda cria no dia selecionado. */
  onCreate: (input: WorkItemInput) => Promise<void>;
  quickAddRef?: React.RefObject<HTMLInputElement | null>;
  onOpen: (item: WorkItem) => void;
  onToggleDone: (item: WorkItem) => void;
  onMoveTo: (item: WorkItem, to: WorkItemStatus) => void;
  onDelete: (item: WorkItem) => void;
}

/** Etapa 55: os grupos do dia, na ordem em que aparecem na tela. */
const GRUPOS = [
  { id: 'alarmes', titulo: 'Alarmes' },
  { id: 'prazos',  titulo: 'Prazos'  },
  { id: 'semHora', titulo: 'Sem hora' },
] as const;

/** Etapa 110: a sigla do dia da semana, sem o ponto que o `date-fns` acrescenta. */
const SIGLAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const;

/**
 * Etapa 111: significado dos pontos da faixa — azul é lembrete, âmbar é prazo e
 * vermelho é atrasada. Só tokens do sistema; nenhuma cor literal.
 */
const PONTO_LEMBRETE = 'bg-primary';
const PONTO_PRAZO    = 'bg-warning';
const PONTO_ATRASADA = 'bg-destructive';

/** Etapa 111: a legenda discreta, na MESMA ordem em que os pontos aparecem. */
const LEGENDA = [
  { cor: PONTO_LEMBRETE, texto: 'Lembrete' },
  { cor: PONTO_PRAZO,    texto: 'Prazo'    },
  { cor: PONTO_ATRASADA, texto: 'Atrasada' },
] as const;

export function TasksAgendaMode({
  items, overdue, isLoading, onCreate, quickAddRef, onOpen, onToggleDone, onMoveTo, onDelete,
  doingCount, onOpenContact, onRequestWaitingReason, onComplete, onReopen, onSnooze, onClearReminder, onOpenReminder,
}: Props) {
  const [selectedDay, setSelectedDay] = useState(0); // offset desde hoje
  // Etapa 55: o bloco "Atrasadas" nasce colapsado quando passa de 3.
  const [mostraAtrasadas, setMostraAtrasadas] = useState(overdue.length <= 3);
  // Etapa 110: as setas ←/→ andam pela faixa e levam o foco junto.
  const diaRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const now       = new Date();
  const startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
  const weeks     = weekBuckets(items, startDate);

  if (isLoading) {
    return <div className="w-full min-w-0 space-y-2">{Array.from({ length: 4 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}</div>;
  }

  const dayData = weeks[selectedDay] ?? { reminders: [], dueTasks: [] };
  const grupos  = groupAgendaDay(dayData);
  const noDia   = new Set([...grupos.alarmes, ...grupos.prazos, ...grupos.semHora].map(i => i.id)).size;

  // Etapa 109: o rótulo da semana — "11 – 17 de outubro de 2026". Quando a
  // janela vira o mês (29 out – 4 nov), o mês de partida também aparece, para
  // que a faixa não anuncie "29 – 4 de novembro".
  const primeiroDia = weeks[0]?.date ?? startDate;
  const ultimoDia   = weeks[weeks.length - 1]?.date ?? startDate;
  const mesmaJanela = primeiroDia.getMonth() === ultimoDia.getMonth()
    && primeiroDia.getFullYear() === ultimoDia.getFullYear();
  const faixaDaSemana = mesmaJanela
    ? `${format(primeiroDia, 'd')} – ${format(ultimoDia, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
    : `${format(primeiroDia, "d 'de' MMMM", { locale: ptBR })} – ${format(ultimoDia, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;

  // Etapa 111: as atrasadas ficam ANTES do primeiro dia da faixa (hoje), por isso
  // só o cartão de hoje recebe a contagem — como já era na etapa 55.
  const atrasadasDoDia = (i: number) => (i === 0 ? overdue.length : 0);

  /** Etapa 111: até 3 pontos, um por TIPO presente no dia (azul/âmbar/vermelho). */
  const pontosDoDia = (i: number): string[] => {
    const dados = weeks[i];
    if (!dados) return [];
    const conta = agendaDayCounts(dados, atrasadasDoDia(i));
    const cores: string[] = [];
    if (conta.lembretes > 0) cores.push(PONTO_LEMBRETE);
    if (conta.prazos > 0)    cores.push(PONTO_PRAZO);
    if (conta.atrasadas > 0) cores.push(PONTO_ATRASADA);
    return cores;
  };

  /**
   * Etapa 111: o nome acessível do cartão do dia traz a data E as contagens por
   * tipo ("2 lembretes, 1 prazo"), que a faixa não escreve por extenso.
   */
  const rotuloDoDia = (i: number): string => {
    const dados = weeks[i] ?? { reminders: [], dueTasks: [] };
    const data  = weeks[i]?.date ?? startDate;
    return `${format(data, "EEEE, d 'de' MMMM", { locale: ptBR })} — ${agendaDayAriaLabel(dados, atrasadasDoDia(i))}`;
  };

  /** Etapa 110: ←/→ trocam o dia selecionado; nos limites não há volta (sem wrap). */
  const irParaDia = (destino: number) => {
    if (destino < 0 || destino > weeks.length - 1) return;
    setSelectedDay(destino);
    diaRefs.current[destino]?.focus();
  };

  const teclaDaFaixa = (evento: React.KeyboardEvent, i: number) => {
    if (evento.key === 'ArrowRight') { evento.preventDefault(); irParaDia(i + 1); }
    if (evento.key === 'ArrowLeft')  { evento.preventDefault(); irParaDia(i - 1); }
  };

  // Etapa 57: o dia selecionado vai pré-preenchido no QuickAdd (fim do dia, como
  // os chips "Hoje/Amanhã" já faziam). Fase F2 (auditoria): sem `key` — trocar de
  // dia reaplica o prazo por dentro do campo (ajuste no render) e o rascunho
  // digitado sobrevive à troca.
  const diaSelecionado = weeks[selectedDay]?.date ?? startDate;
  const dueDoDia = new Date(diaSelecionado);
  dueDoDia.setHours(23, 59, 0, 0);

  const cardProps = (item: WorkItem) => ({
    item,
    mode: 'agenda' as const,
    onOpen:       () => onOpen(item),
    onToggleDone: () => onToggleDone(item),
    onMoveTo:     (to: WorkItemStatus) => onMoveTo(item, to),
    onDelete:     () => onDelete(item),
    contactName:  item.contact?.name ?? undefined,
    onOpenContact: onOpenContact ? () => onOpenContact(item) : undefined,
    onRequestWaitingReason: onRequestWaitingReason ? () => onRequestWaitingReason(item) : undefined,
    doingCount:   doingCount ?? 0,
    onComplete:   onComplete ? () => onComplete(item) : undefined,
    onReopen:     onReopen ? () => onReopen(item) : undefined,
    onSnooze:     onSnooze ? (minutes: number | 'tomorrow9') => onSnooze(item, minutes) : undefined,
    onClearReminder: onClearReminder ? () => onClearReminder(item) : undefined,
    onOpenReminder:  onOpenReminder ? () => onOpenReminder(item) : undefined,
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* Etapa 108 — Faixa de atrasadas: largura total, vermelho suave, e o
          "Ver tarefas" que abre a lista (substitui o bloco antigo). */}
      {overdue.length > 0 && (
        <div id="agenda-atrasadas" className="w-full min-w-0 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
          <button
            type="button"
            onClick={() => setMostraAtrasadas(v => !v)}
            aria-expanded={mostraAtrasadas}
            aria-controls="agenda-atrasadas"
            className="flex min-h-6 w-full items-center gap-2 text-left"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span className="min-w-0 text-[13px] font-semibold text-destructive">
              {overdue.length} tarefa{overdue.length === 1 ? '' : 's'} atrasada{overdue.length === 1 ? '' : 's'}
            </span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-destructive">
              Ver tarefas
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${mostraAtrasadas ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </span>
          </button>
          {mostraAtrasadas && (
            <div className="mt-2 space-y-1.5">
              {overdue.map(item => <WorkItemCard key={item.id} {...cardProps(item)} />)}
            </div>
          )}
        </div>
      )}

      {/* Etapa 109 — Título da semana, o intervalo à direita e a nota. */}
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-[13px] font-semibold text-foreground">Próximos 7 dias</h3>
          <span className="text-2xs tabular-nums text-muted-foreground" data-testid="agenda-week-range">
            {faixaDaSemana}
          </span>
        </div>
        <p className="text-2xs text-muted-foreground">O lembrete avisa você. O prazo marca a entrega.</p>
      </div>

      {/* Etapa 110 — Faixa de 7 dias: sigla, número, pílula "Hoje" e os pontos
          (etapa 111). ←/→ andam pela faixa, sem volta nos limites. */}
      <div className="flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1 snap-x">
        {weeks.map((w, i) => {
          const weekend = isWeekend(w.date);
          const active  = selectedDay === i;
          const dots    = pontosDoDia(i);
          return (
            <button
              key={i}
              ref={el => { diaRefs.current[i] = el; }}
              type="button"
              onClick={() => setSelectedDay(i)}
              onKeyDown={evento => teclaDaFaixa(evento, i)}
              aria-label={rotuloDoDia(i)}
              aria-current={active ? 'date' : undefined}
              data-testid="agenda-day"
              data-offset={i}
              className={[
                'flex min-h-[64px] min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-1.5 snap-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active  ? 'border-primary bg-accent text-foreground' : '',
                weekend && !active ? 'bg-muted/30 text-muted-foreground' : '',
                !active && !weekend ? 'border-border/50 hover:border-primary/40 hover:bg-primary/5' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="text-2xs font-semibold tracking-wide">
                {SIGLAS[w.date.getDay()]}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-xl font-bold tabular-nums leading-none">
                  {format(w.date, 'd')}
                </span>
                {i === 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-primary">
                    Hoje
                  </span>
                )}
              </span>
              <span className="flex h-1.5 items-center gap-0.5" data-testid="agenda-day-dots">
                {dots.map((cor, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${cor}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Etapa 111 — legenda discreta dos pontos. */}
      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1" data-testid="agenda-dots-legend">
        {LEGENDA.map(({ cor, texto }) => (
          <span key={texto} className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${cor}`} aria-hidden="true" />
            {texto}
          </span>
        ))}
      </div>

      {/* QuickAdd do dia selecionado (etapa 57) */}
      <QuickAdd
        ref={quickAddRef}
        onAdd={onCreate}
        defaultStatus="todo"
        defaultDueDate={dueDoDia.toISOString()}
        placeholder={`Adicionar em ${format(diaSelecionado, 'dd/MM')}… (Enter para criar)`}
      />

      {/* Lista do dia selecionado, em 3 grupos */}
      <div className="min-w-0 space-y-3">
        {noDia === 0 && (
          <p className="text-center text-[13px] text-muted-foreground py-8">Nenhuma tarefa neste dia</p>
        )}
        {GRUPOS.map(g => {
          const lista = grupos[g.id];
          if (lista.length === 0) return null;
          return (
            <section key={g.id} aria-label={g.titulo} className="min-w-0 space-y-1.5">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.titulo} ({lista.length})
              </h3>
              {lista.map(item => g.id === 'alarmes' ? (
                <div key={item.id} className="flex min-w-0 items-center gap-2">
                  <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {item.remind_at ? format(new Date(item.remind_at), 'HH:mm') : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <WorkItemCard {...cardProps(item)} />
                  </div>
                </div>
              ) : (
                <WorkItemCard key={item.id} {...cardProps(item)} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
