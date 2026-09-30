import { useState } from 'react';
import { format, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { weekBuckets, groupAgendaDay, agendaDayDots } from '@/hooks/tasks/workItemAggregates';
import { WorkItemCard } from '../shared/WorkItemCard';
import { WorkItemCardSkeleton } from '../shared/WorkItemCardSkeleton';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

interface Props {
  items: WorkItem[];
  overdue: WorkItem[];
  isLoading: boolean;
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

export function TasksAgendaMode({ items, overdue, isLoading, onOpen, onToggleDone, onMoveTo, onDelete }: Props) {
  const [selectedDay, setSelectedDay] = useState(0); // offset desde hoje
  // Etapa 55: o bloco "Atrasadas" nasce colapsado quando passa de 3.
  const [mostraAtrasadas, setMostraAtrasadas] = useState(overdue.length <= 3);
  const now       = new Date();
  const startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
  const weeks     = weekBuckets(items, startDate);

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}</div>;
  }

  const dayData = weeks[selectedDay] ?? { reminders: [], dueTasks: [] };
  const grupos  = groupAgendaDay(dayData);
  const noDia   = new Set([...grupos.alarmes, ...grupos.prazos, ...grupos.semHora].map(i => i.id)).size;

  const cardProps = (item: WorkItem) => ({
    item,
    mode: 'agenda' as const,
    onOpen:       () => onOpen(item),
    onToggleDone: () => onToggleDone(item),
    onMoveTo:     (to: WorkItemStatus) => onMoveTo(item, to),
    onDelete:     () => onDelete(item),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Atrasadas (expansível; colapsado por padrão quando passa de 3) */}
      {overdue.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
          <button
            type="button"
            onClick={() => setMostraAtrasadas(v => !v)}
            aria-expanded={mostraAtrasadas}
            className="flex w-full items-center gap-2 text-left"
          >
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-[13px] font-semibold text-destructive">
              {overdue.length} atrasada{overdue.length === 1 ? '' : 's'}
            </span>
            <span className="ml-auto text-2xs text-muted-foreground">
              {mostraAtrasadas ? 'Ver menos' : 'Ver todas'}
            </span>
            {mostraAtrasadas
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {mostraAtrasadas && (
            <div className="mt-2 space-y-1.5">
              {overdue.map(item => <WorkItemCard key={item.id} {...cardProps(item)} />)}
            </div>
          )}
        </div>
      )}

      {/* Faixa de 7 dias: até 3 pontos por tipo de compromisso (etapa 55) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x">
        {weeks.map((w, i) => {
          const weekend = isWeekend(w.date);
          const active  = selectedDay === i;
          const dots    = agendaDayDots(w, i === 0 ? overdue.length : 0);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDay(i)}
              className={[
                'flex flex-col items-center gap-0.5 min-w-[64px] h-[64px] rounded-xl border px-2 py-1.5 snap-start transition-colors',
                active  ? 'border-primary bg-accent text-foreground' : '',
                weekend && !active ? 'bg-muted/30 text-muted-foreground' : '',
                !active && !weekend ? 'border-border/50 hover:border-primary/40 hover:bg-primary/5' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="text-2xs font-medium capitalize">
                {format(w.date, 'EEE', { locale: ptBR })}
              </span>
              <span className="text-xl font-bold tabular-nums leading-none">
                {format(w.date, 'd')}
              </span>
              <span className="flex h-1.5 items-center gap-0.5" data-testid="agenda-day-dots">
                {dots.map((cor, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${cor}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Lista do dia selecionado, em 3 grupos */}
      <div className="space-y-3">
        {noDia === 0 && (
          <p className="text-center text-[13px] text-muted-foreground py-8">Nenhuma tarefa neste dia</p>
        )}
        {GRUPOS.map(g => {
          const lista = grupos[g.id];
          if (lista.length === 0) return null;
          return (
            <section key={g.id} aria-label={g.titulo} className="space-y-1.5">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.titulo} ({lista.length})
              </h3>
              {lista.map(item => g.id === 'alarmes' ? (
                <div key={item.id} className="flex items-center gap-2">
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
