import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WorkItemCard }         from '../shared/WorkItemCard';
import { WorkItemCardSkeleton } from '../shared/WorkItemCardSkeleton';
import { TasksEmptyState }      from '../TasksEmptyState';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { groupUpcomingByDay }   from '@/hooks/tasks/workItemAggregates';
import type { BucketsByDue, DayGroup } from '@/hooks/tasks/workItemAggregates';
import type { WorkItemCardActions } from '../shared/cardActions';

interface Props extends WorkItemCardActions {
  byDue: BucketsByDue;
  isLoading: boolean;
  /** Texto da busca (compatibilidade com chamadas antigas do modo Lista). */
  searchQuery?: string;
  /** Fase F (auditoria): QUALQUER filtro ativo (busca, prioridade, contato,
   *  alarme, concluídas) faz a Lista oferecer "Limpar filtros" quando esvazia —
   *  antes só a busca fazia isso e a tela mentia dizendo "Adicione a primeira". */
  filtersActive?: boolean;
  onOpen: (item: WorkItem) => void;
  onToggleDone: (item: WorkItem) => void;
  onMoveTo: (item: WorkItem, to: WorkItemStatus) => void;
  onDelete: (item: WorkItem) => void;
  onClearFilter: () => void;
  hasMounted: React.MutableRefObject<boolean>;
}

interface SectionProps {
  title: string;
  items: WorkItem[];
  /** Concluidas de 8 a 30 dias, reveladas pelo rodape "ver mais (30 dias)" (etapa 48/B4). */
  olderItems?: WorkItem[];
  /** Subcabecalhos por dia (etapa 49) — usados pela secao "Proximas". */
  groups?: DayGroup[];
  /** Texto do tooltip do cabecalho (etapa 49). */
  hint?: string;
  defaultOpen?: boolean;
  headingClass?: string;
  /** Ações do card (Fase C2) — passadas ao `WorkItemCard` de cada item.
   *  Opcional de propósito: a `Section` nunca quebra se o chamador não mandar. */
  cardActions?: WorkItemCardActions;
  onOpen: Props['onOpen'];
  onToggleDone: Props['onToggleDone'];
  onMoveTo: Props['onMoveTo'];
  onDelete: Props['onDelete'];
  hasMounted: React.MutableRefObject<boolean>;
}

function Section({ title, items, olderItems = [], groups, hint, defaultOpen = true, headingClass = '', cardActions, onOpen, onToggleDone, onMoveTo, onDelete, hasMounted }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showOlder, setShowOlder] = useState(false);
  // Etapa 50: com reduced-motion as animacoes (entrada e saida) viram instantaneas.
  const reduceMotion = useReducedMotion() ?? false;
  // Etapa 51: a secao existe enquanto houver o que mostrar — inclusive quando so ha
  // concluidas de 8 a 30 dias, que ficam atras do rodape "ver mais (30 dias)".
  if (items.length === 0 && olderItems.length === 0) return null;
  const Icon = open ? ChevronDown : ChevronRight;
  const visible = showOlder ? [...items, ...olderItems] : items;
  const renderCard = (item: WorkItem, index: number) => {
    const { doingCount, onOpenContact, onRequestWaitingReason, onComplete, onReopen, onSnooze, onClearReminder, onOpenReminder } = cardActions ?? {};
    return (
      <motion.div
        key={item.id}
        initial={hasMounted.current ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, transition: { duration: reduceMotion ? 0 : 0.2 } }}
        transition={{ duration: reduceMotion ? 0 : 0.15, delay: reduceMotion ? 0 : Math.min(index, 12) * 0.02 }}
        className="overflow-hidden"
      >
        <WorkItemCard
          item={item}
          mode="list"
          onOpen={() => onOpen(item)}
          onToggleDone={() => onToggleDone(item)}
          onMoveTo={(to) => onMoveTo(item, to)}
          onDelete={() => onDelete(item)}
          contactName={item.contact?.name ?? undefined}
          onOpenContact={onOpenContact ? () => onOpenContact(item) : undefined}
          onRequestWaitingReason={onRequestWaitingReason ? () => onRequestWaitingReason(item) : undefined}
          doingCount={doingCount ?? 0}
          onComplete={onComplete ? () => onComplete(item) : undefined}
          onReopen={onReopen ? () => onReopen(item) : undefined}
          onSnooze={onSnooze ? (minutes) => onSnooze(item, minutes) : undefined}
          onClearReminder={onClearReminder ? () => onClearReminder(item) : undefined}
          onOpenReminder={onOpenReminder ? () => onOpenReminder(item) : undefined}
        />
      </motion.div>
    );
  };
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1.5 text-[13px] font-semibold ${headingClass || 'text-muted-foreground'} hover:text-foreground transition-colors`}
        >
          <Icon className="h-4 w-4" />
          {title}
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs tabular-nums">{visible.length}</span>
        </button>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={hint}
                className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="min-w-0 overflow-hidden space-y-1.5"
          >
            {groups && groups.length > 0
              ? groups.map(g => (
                  <div key={g.label} className="space-y-1.5">
                    <div className="px-1 text-xs font-medium text-muted-foreground">{g.label}</div>
                    <AnimatePresence initial={false}>
                      {g.items.map((item, index) => renderCard(item, index))}
                    </AnimatePresence>
                  </div>
                ))
              : (
                <AnimatePresence initial={false}>
                  {visible.map((item, index) => renderCard(item, index))}
                </AnimatePresence>
              )}
            {olderItems.length > 0 && (
              <button
                type="button"
                onClick={() => setShowOlder(s => !s)}
                className="w-full rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                {showOlder ? 'ver menos' : 'ver mais (30 dias)'}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TasksListMode({
  byDue, isLoading, searchQuery, filtersActive, onOpen, onToggleDone, onMoveTo, onDelete, onClearFilter, hasMounted,
  doingCount, onOpenContact, onRequestWaitingReason, onComplete, onReopen, onSnooze, onClearReminder, onOpenReminder,
}: Props) {
  if (isLoading) {
    return (
      <div className="w-full min-w-0 space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}
      </div>
    );
  }

  const total = byDue.overdue.length + byDue.today.length + byDue.tomorrow.length + byDue.upcoming.length + byDue.noDue.length;

  if (total === 0 && byDue.done7d.length === 0 && byDue.doneOlder.length === 0) {
    const filtroAtivo = filtersActive ?? (searchQuery ?? '') !== '';
    if (filtroAtivo) return <TasksEmptyState variant="filter" onClearFilter={onClearFilter} />;
    return <TasksEmptyState variant="all" />;
  }

  // Ações do card (Fase C2) num objeto só — evita repetir 7 props nas 6 seções.
  const cardActions: WorkItemCardActions = {
    doingCount, onOpenContact, onRequestWaitingReason, onComplete, onReopen, onSnooze, onClearReminder, onOpenReminder,
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-8">
      <Section title="Atrasadas"   items={byDue.overdue}   headingClass="text-destructive" defaultOpen cardActions={cardActions} onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Hoje"        items={byDue.today}     headingClass="text-warning"     defaultOpen cardActions={cardActions} onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Amanhã"     items={byDue.tomorrow}  defaultOpen cardActions={cardActions} onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Próximas"   items={byDue.upcoming}  groups={groupUpcomingByDay(byDue.upcoming)} hint="Ordenado por prazo, depois prioridade" defaultOpen cardActions={cardActions} onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Sem prazo"   items={byDue.noDue}    defaultOpen={byDue.noDue.length <= 10} cardActions={cardActions} onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Concluídas (7 dias)" items={byDue.done7d} olderItems={byDue.doneOlder} headingClass="text-muted-foreground/60" defaultOpen={false} cardActions={cardActions} onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
    </div>
  );
}
