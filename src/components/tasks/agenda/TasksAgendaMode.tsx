import { useState } from 'react';
import { addDays, format, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle } from 'lucide-react';
import { weekBuckets } from '@/hooks/tasks/workItemAggregates';
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

export function TasksAgendaMode({ items, overdue, isLoading, onOpen, onToggleDone, onMoveTo, onDelete }: Props) {
  const [selectedDay, setSelectedDay] = useState(0); // offset desde hoje
  const now       = new Date();
  const startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
  const weeks     = weekBuckets(items, startDate);

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}</div>;
  }

  const dayData = weeks[selectedDay] ?? { reminders: [], dueTasks: [] };
  const dayItems = [
    ...dayData.reminders,
    ...dayData.dueTasks.filter(t => !dayData.reminders.find(r => r.id === t.id)),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Atrasadas (sempre visíveis) */}
      {overdue.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-[13px] font-semibold text-destructive">{overdue.length} atrasadas</span>
          </div>
          <div className="space-y-1.5">
            {overdue.map(item => (
              <WorkItemCard key={item.id} item={item} mode="agenda"
                onOpen={() => onOpen(item)} onToggleDone={() => onToggleDone(item)}
                onMoveTo={(to) => onMoveTo(item, to)} onDelete={() => onDelete(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Faixa de 7 dias */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x">
        {weeks.map((w, i) => {
          const weekend = isWeekend(w.date);
          const active  = selectedDay === i;
          const count   = w.reminders.length + w.dueTasks.length;
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
              <span className="text-[11px] font-medium capitalize">
                {format(w.date, 'EEE', { locale: ptBR })}
              </span>
              <span className="text-[20px] font-bold tabular-nums leading-none">
                {format(w.date, 'd')}
              </span>
              {count > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Lista do dia selecionado */}
      <div className="space-y-1.5">
        {dayItems.length === 0 && (
          <p className="text-center text-[13px] text-muted-foreground py-8">Nenhuma tarefa neste dia</p>
        )}
        {dayItems.map(item => (
          <WorkItemCard key={item.id} item={item} mode="agenda"
            onOpen={() => onOpen(item)} onToggleDone={() => onToggleDone(item)}
            onMoveTo={(to) => onMoveTo(item, to)} onDelete={() => onDelete(item)}
          />
        ))}
      </div>
    </div>
  );
}
