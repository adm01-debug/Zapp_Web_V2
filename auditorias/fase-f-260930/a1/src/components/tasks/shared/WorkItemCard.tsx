import React from 'react';
import { MoreVertical, MessageSquare } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { agingDays } from '@/hooks/tasks/workItemMachine';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { PriorityChip }  from './PriorityChip';
import { DueChip }       from './DueChip';
import { RemindChip }    from './RemindChip';
import { ContactChip }   from './ContactChip';
import { AgingDot }      from './AgingDot';

interface Props {
  item: WorkItem;
  mode: 'list' | 'board' | 'agenda';
  contactName?: string | null;
  onOpen?: () => void;
  onToggleDone?: () => void;
  onMoveTo?: (status: WorkItemStatus) => void;
  onDelete?: () => void;
  onOpenContact?: () => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}

export const WorkItemCard = React.memo(function WorkItemCard({
  item, mode, contactName, onOpen, onToggleDone, onMoveTo, onDelete, onOpenContact,
  isDragging, dragHandleProps,
}: Props) {
  const aging = ['doing','waiting'].includes(item.status) ? agingDays(item) : 0;
  const isDone = item.status === 'done' || item.status === 'cancelled';
  // Etapa 56: na Agenda o card é uma linha só, de 44px (h-11).
  const isAgenda = mode === 'agenda';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onOpen?.();
    if (e.key === 'x' || e.key === 'X') onToggleDone?.();
    if (e.key === 'Delete') onDelete?.();
  };

  // Peças montadas uma vez e usadas nos dois layouts (nada de copiar JSX).
  const checkbox = (mode === 'list' || isAgenda) ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggleDone?.(); }}
      className={`${isAgenda ? '' : 'mt-0.5'} h-[18px] w-[18px] shrink-0 rounded-[4px] border-2 border-border flex items-center justify-center hover:border-primary transition-colors`}
      aria-label={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}
    >
      {isDone && <span className="block h-2.5 w-2.5 rounded-sm bg-primary" />}
    </button>
  ) : null;

  const titulo = (
    <span className={`flex-1 min-w-0 text-sm font-semibold leading-snug truncate ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
      {item.title}
    </span>
  );

  const contexto = (
    <>
      {contactName && <ContactChip contactName={contactName} onClick={onOpenContact} />}
      {item.due_date && !isDone && <DueChip dueDate={item.due_date} />}
      {item.remind_at && !isDone && (
        <RemindChip remindAt={item.remind_at} notifiedAt={item.notified_at} />
      )}
      {aging > 0 && <AgingDot days={aging} />}
    </>
  );

  const kebab = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`${isAgenda ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'} h-6 w-6 shrink-0 rounded-md hover:bg-muted transition-opacity flex items-center justify-center`}
          aria-label="Mais opções"
        >
          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen?.(); }}>Abrir</DropdownMenuItem>
        {onMoveTo && (
          <>
            <DropdownMenuSeparator />
            <span className="px-2 py-1 text-2xs text-muted-foreground">Mover para</span>
            {KANBAN_COLUMNS
              .filter(c => c.status !== item.status)
              .map(c => (
                <DropdownMenuItem
                  key={c.status}
                  onClick={(e) => { e.stopPropagation(); onMoveTo(c.status); }}
                >
                  {c.shortLabel}
                </DropdownMenuItem>
              ))
            }
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          className="text-destructive focus:text-destructive"
        >
          Remover
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <article
      data-testid="work-item-card"
      data-mode={mode}
      tabIndex={0}
      role="article"
      aria-label={[item.title, item.status, item.due_date ? 'prazo ' + item.due_date : ''].filter(Boolean).join(', ')}
      onKeyDown={handleKeyDown}
      onClick={onOpen}
      className={[
        'group relative border bg-card cursor-pointer',
        isAgenda
          ? 'flex flex-row h-11 items-center gap-2 rounded-xl px-3'
          : 'flex flex-col gap-1.5 rounded-[14px] p-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'transition-[border-color,box-shadow,transform] duration-150',
        isDragging
          ? 'border-primary/60 shadow-[0_8px_24px_-8px_hsl(var(--primary)/.45)] rotate-[1deg] scale-[1.02]'
          : isDone
            ? 'border-border/40 opacity-60'
            : 'border-border/70 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/.25)]',
      ].join(' ')}
      {...(mode === 'board' && dragHandleProps ? dragHandleProps : {})}
    >
      {isAgenda ? (
        /* Linha única (etapa 56): checkbox · título · chips à direita · kebab */
        <>
          {checkbox}
          {titulo}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 min-w-0 overflow-hidden">
            <PriorityChip priority={item.priority} compact />
            {contexto}
          </div>
          {kebab}
        </>
      ) : (
        <>
          {/* Header: checkbox (lista) ou title */}
          <div className="flex items-start gap-2 min-w-0">
            {checkbox}
            {titulo}
            <PriorityChip priority={item.priority} compact />
            {kebab}
          </div>

          {/* Chips de contexto */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            {contexto}
          </div>

          {/* Motivo de espera (a Agenda não mostra — etapa 56) */}
          {item.status === 'waiting' && item.waiting_reason && (
            <p className="flex items-center gap-1 text-2xs text-warning/80 border-t border-border/30 pt-1.5 mt-0.5">
              <span className="shrink-0">⏸</span>
              <span className="truncate">{item.waiting_reason}</span>
            </p>
          )}

          {/* Acoes rapidas (modo board, mobile) */}
          {mode === 'board' && onOpenContact && contactName && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenContact(); }}
              className="absolute bottom-2 right-2 h-6 w-6 rounded-md bg-muted/80 hover:bg-primary/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Abrir conversa"
              aria-label="Abrir conversa"
            >
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </>
      )}
    </article>
  );
});
