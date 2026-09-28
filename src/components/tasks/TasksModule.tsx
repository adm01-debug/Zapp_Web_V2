import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Filter, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useMyWorkItems }   from '@/hooks/tasks/useMyWorkItems';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { ModeSwitcher, type TaskMode } from './shared/ModeSwitcher';
import { QuickAdd }         from './shared/QuickAdd';
import { TasksListMode }    from './list/TasksListMode';
import { TasksBoardMode }   from './board/TasksBoardMode';
import { TasksAgendaMode }  from './agenda/TasksAgendaMode';

interface Props {
  defaultMode?: TaskMode;
}

const STORAGE_KEY = 'tasks-mode';

export function TasksModule({ defaultMode = 'list' }: Props) {
  const savedMode = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) as TaskMode) || defaultMode;
  const [mode, setModeState] = useState<TaskMode>(savedMode);
  const [search, setSearch]  = useState('');
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);

  const setMode = (m: TaskMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  const opts = mode === 'board'
    ? { includeDone: true }
    : {};

  const hook = useMyWorkItems(opts);
  const { byDue, byStatus, kpis, isLoading, isError, create, move, reorder, complete, deleteItem, hasMounted } = hook;

  // Filtro de busca (local)
  const filteredByDue = search
    ? {
        overdue:  byDue.overdue.filter(i => i.title.toLowerCase().includes(search.toLowerCase())),
        today:    byDue.today.filter(i => i.title.toLowerCase().includes(search.toLowerCase())),
        tomorrow: byDue.tomorrow.filter(i => i.title.toLowerCase().includes(search.toLowerCase())),
        upcoming: byDue.upcoming.filter(i => i.title.toLowerCase().includes(search.toLowerCase())),
        noDue:    byDue.noDue.filter(i => i.title.toLowerCase().includes(search.toLowerCase())),
        done7d:   byDue.done7d.filter(i => i.title.toLowerCase().includes(search.toLowerCase())),
      }
    : byDue;

  // Atalho N → foca o QuickAdd
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        quickAddRef.current?.focus();
      }
      if (e.key === '1') setMode('list');
      if (e.key === '2') setMode('board');
      if (e.key === '3') setMode('agenda');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleToggleDone = useCallback(async (item: WorkItem) => {
    if (item.status === 'done') await hook.reopen(item);
    else await complete(item);
  }, [hook, complete]);

  const handleMoveTo = useCallback((item: WorkItem, to: WorkItemStatus) => {
    void move(item, to);
  }, [move]);

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Não foi possível carregar suas tarefas</p>
        <button type="button" onClick={() => hook.refetch()} className="text-sm text-primary hover:underline">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div data-testid="tasks-module" className="flex flex-col h-full gap-4">
      <PageHeader
        variant="plain"
        title="Tarefas"
        subtitle="Suas tarefas pessoais"
        breadcrumbs={[{ label: 'Início', href: '/' }, { label: 'Tarefas' }]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Atrasadas',  value: kpis.overdue,   cls: 'text-destructive' },
          { label: 'Para hoje',  value: kpis.dueToday,  cls: 'text-warning' },
          { label: 'Fazendo',    value: kpis.doingCount,cls: 'text-primary' },
          { label: 'Concluídas (7d)', value: kpis.done7d, cls: 'text-success' },
          { label: 'Cycle time', value: kpis.avgCycleTimeDays != null ? Math.round(kpis.avgCycleTimeDays) + 'd' : '—', cls: 'text-muted-foreground' },
        ].map(({ label, value, cls }) => (
          <div key={label} data-testid="kpi-card" className="flex flex-col gap-1 rounded-[14px] border border-border/70 bg-card px-4 py-3">
            <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
            <span className={`text-[26px] font-bold tabular-nums leading-none ${cls}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* QuickAdd */}
      <QuickAdd ref={quickAddRef} onAdd={create} defaultStatus="backlog" />

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[420px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tarefa…"
            className="h-11 w-full rounded-xl bg-input border border-border pl-9 pr-4 text-[15px] placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="ml-auto">
          <ModeSwitcher mode={mode} onChange={setMode} />
        </div>
      </div>

      {/* Conteúdo com troca de modo */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="flex-1 min-h-0 overflow-auto"
        >
          {mode === 'list' && (
            <TasksListMode
              byDue={filteredByDue}
              isLoading={isLoading}
              searchQuery={search}
              onOpen={setSelectedItem}
              onToggleDone={handleToggleDone}
              onMoveTo={handleMoveTo}
              onDelete={deleteItem}
              onClearFilter={() => setSearch('')}
              hasMounted={hasMounted}
            />
          )}
          {mode === 'board' && (
            <TasksBoardMode
              byStatus={byStatus}
              isLoading={isLoading}
              onMove={move}
              onReorder={reorder}
              onOpen={setSelectedItem}
              onDelete={deleteItem}
              onCreate={create}
            />
          )}
          {mode === 'agenda' && (
            <TasksAgendaMode
              items={hook.items}
              overdue={byDue.overdue}
              isLoading={isLoading}
              onOpen={setSelectedItem}
              onToggleDone={handleToggleDone}
              onMoveTo={handleMoveTo}
              onDelete={deleteItem}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
