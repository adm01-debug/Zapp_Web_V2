import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { WorkItemCard }         from '../shared/WorkItemCard';
import { WorkItemCardSkeleton } from '../shared/WorkItemCardSkeleton';
import { TasksEmptyState }      from '../TasksEmptyState';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { BucketsByDue }    from '@/hooks/tasks/workItemAggregates';

interface Props {
  byDue: BucketsByDue;
  isLoading: boolean;
  searchQuery: string;
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
  defaultOpen?: boolean;
  headingClass?: string;
  onOpen: Props['onOpen'];
  onToggleDone: Props['onToggleDone'];
  onMoveTo: Props['onMoveTo'];
  onDelete: Props['onDelete'];
  hasMounted: React.MutableRefObject<boolean>;
}

function Section({ title, items, defaultOpen = true, headingClass = '', onOpen, onToggleDone, onMoveTo, onDelete, hasMounted }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-[13px] font-semibold ${headingClass || 'text-muted-foreground'} hover:text-foreground transition-colors`}
      >
        <Icon className="h-4 w-4" />
        {title}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{items.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden space-y-1.5"
          >
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={hasMounted.current ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(index, 12) * 0.02 }}
              >
                <WorkItemCard
                  item={item}
                  mode="list"
                  onOpen={() => onOpen(item)}
                  onToggleDone={() => onToggleDone(item)}
                  onMoveTo={(to) => onMoveTo(item, to)}
                  onDelete={() => onDelete(item)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TasksListMode({ byDue, isLoading, searchQuery, onOpen, onToggleDone, onMoveTo, onDelete, onClearFilter, hasMounted }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => <WorkItemCardSkeleton key={i} />)}
      </div>
    );
  }

  const total = byDue.overdue.length + byDue.today.length + byDue.tomorrow.length + byDue.upcoming.length + byDue.noDue.length;

  if (total === 0 && byDue.done7d.length === 0) {
    return searchQuery
      ? <TasksEmptyState variant="filter" onClearFilter={onClearFilter} />
      : <TasksEmptyState variant="all" />;
  }

  return (
    <div className="space-y-6 pb-8">
      <Section title="Atrasadas"   items={byDue.overdue}   headingClass="text-destructive" defaultOpen onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Hoje"        items={byDue.today}     headingClass="text-warning"     defaultOpen onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Amanha"     items={byDue.tomorrow}  defaultOpen onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Proximas"   items={byDue.upcoming}  defaultOpen onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Sem prazo"   items={byDue.noDue}                defaultOpen onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
      <Section title="Concluidas" items={byDue.done7d}    headingClass="text-muted-foreground/60" defaultOpen={false} onOpen={onOpen} onToggleDone={onToggleDone} onMoveTo={onMoveTo} onDelete={onDelete} hasMounted={hasMounted} />
    </div>
  );
}
