import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useMyWorkItems }   from '@/hooks/tasks/useMyWorkItems';
import { applyFilters, bucketByDue, bucketByStatus, kpis } from '@/hooks/tasks/workItemAggregates';
import { useTasksFilters }  from '@/hooks/tasks/useTasksFilters';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { ModeSwitcher, type TaskMode } from './shared/ModeSwitcher';
import { QuickAdd }         from './shared/QuickAdd';
import { TasksFilterBar }   from './shared/TasksFilterBar';
import { TasksKpiStrip }    from './shared/TasksKpiStrip';
import { TasksListMode }    from './list/TasksListMode';
import { TasksBoardMode }   from './board/TasksBoardMode';
import { TasksAgendaMode }  from './agenda/TasksAgendaMode';

interface Props {
  defaultMode?: TaskMode;
  /** B7 (etapa 47): a rota `?view=pipeline` manda o Quadro e ignora o modo salvo. */
  forceMode?: boolean;
}

const STORAGE_KEY = 'tasks-mode';

export function TasksModule({ defaultMode = 'list', forceMode = false }: Props) {
  const savedMode = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) as TaskMode) || defaultMode;
  // B7 (etapa 47): com `forceMode` o modo da rota (`?view=pipeline`) vence o
  // modo salvo. A gravacao continua so em `setMode`, que e o trocar de modo
  // pelo usuario — visitar a rota nao reescreve a preferencia dele.
  const [mode, setModeState] = useState<TaskMode>(forceMode ? defaultMode : savedMode);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);

  const setMode = (m: TaskMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  // B13: uma unica query para os tres modos. A query ja traz `done` dos ultimos
  // 30 dias; o recorte de 7 dias da Lista e local. Trocar de modo nao gera request.
  const hook = useMyWorkItems();
  const { isLoading, isError, create, move, reorder, complete, deleteItem } = hook;

  // Etapa 45/46: a barra de filtros (estado no reducer, espelhado na URL) e o
  // recorte aplicado UMA vez, sobre os itens que a query única já carregou —
  // nenhum modo nem filtro dispara request novo (B13 continua valendo).
  const filtros = useTasksFilters();
  const items = applyFilters(hook.items, filtros.filters);
  const byDue = bucketByDue(items);
  const byStatus = bucketByStatus(items);
  const kpiData = kpis(items);

  // Contatos que aparecem nas tarefas carregadas: fonte local, sem query nova.
  const contactOptions = Array.from(
    new Map(
      hook.items
        .filter(i => i.contact !== null)
        .map(i => [i.contact!.id, { id: i.contact!.id, name: i.contact!.name ?? '' }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Etapa 43: o subtítulo do cabeçalho mostra números reais em pt-BR (separador
  // de milhar) e com singular correto — "1 aberta", não "1 abertas".
  const openCount = byStatus.backlog.length + byStatus.todo.length + byStatus.doing.length + byStatus.waiting.length;
  const subtitleAbertas = `${openCount.toLocaleString('pt-BR')} ${openCount === 1 ? 'aberta' : 'abertas'}`;
  const subtitleHoje = `${kpiData.dueToday.toLocaleString('pt-BR')} para hoje`;

  // Flag de animacao de entrada: saiu da API do hook na etapa 18 e vive aqui.
  const hasMounted = useRef(false);
  useEffect(() => { hasMounted.current = true; }, []);

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
        subtitle={`${subtitleAbertas} · ${subtitleHoje}`}
        breadcrumbs={[{ label: 'Início', href: '/' }, { label: 'Tarefas' }]}
      />

      {/* KPIs (etapa 44: 5 cards de 88px no padrão ContactKpiCard) */}
      <TasksKpiStrip kpis={kpiData} />

      {/* QuickAdd */}
      <QuickAdd ref={quickAddRef} onAdd={create} defaultStatus="backlog" />

      {/* Toolbar: barra de filtros (etapa 45) + troca de modo */}
      <div className="flex items-center gap-3 flex-wrap">
        <TasksFilterBar
          filters={filtros.filters}
          searchText={filtros.textoDaBusca}
          contactOptions={contactOptions}
          onSearch={filtros.setSearch}
          onPrio={filtros.setPrio}
          onContact={filtros.setContact}
          onToggleAlarm={filtros.toggleAlarm}
          onToggleDone={filtros.toggleDone}
          onClear={filtros.clear}
          isActive={filtros.isActive}
        />
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
              byDue={byDue}
              isLoading={isLoading}
              searchQuery={filtros.filters.q}
              onOpen={setSelectedItem}
              onToggleDone={handleToggleDone}
              onMoveTo={handleMoveTo}
              onDelete={deleteItem}
              onClearFilter={filtros.clear}
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
              items={items}
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
