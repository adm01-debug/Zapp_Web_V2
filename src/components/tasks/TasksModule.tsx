import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useMyWorkItems }   from '@/hooks/tasks/useMyWorkItems';
import { applyFilters, bucketByDue, bucketByStatus, kpis } from '@/hooks/tasks/workItemAggregates';
import { countDoing } from '@/hooks/tasks/workItemMachine';
import { useTasksFilters }  from '@/hooks/tasks/useTasksFilters';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { ModeSwitcher, type TaskMode } from './shared/ModeSwitcher';
import { QuickAdd }         from './shared/QuickAdd';
import { TasksFilterBar }   from './shared/TasksFilterBar';
import { TasksKpiStrip }    from './shared/TasksKpiStrip';
import { TasksListMode }    from './list/TasksListMode';
import { TasksBoardMode }   from './board/TasksBoardMode';
import { TasksAgendaMode }  from './agenda/TasksAgendaMode';
import { WorkItemSheet }    from './shared/WorkItemSheet';

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
  /** Etapa 28 (B2): o Sheet aberto por DnD/kebab já vem pedindo o motivo. */
  const [focusField, setFocusField] = useState<'waiting_reason' | undefined>(undefined);
  /** Etapa 27: id lido da URL uma única vez, no primeiro render. */
  const [idNaUrl] = useState(() => new URLSearchParams(window.location.search).get('task'));
  const [linkConsumido, setLinkConsumido] = useState(false);
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

  // Fase F (auditoria): o filtro é recorte de TELA. O que descreve o trabalho
  // real — contagem do cabeçalho, card "Fazendo" e a trava de WIP do Quadro —
  // olha a lista completa; senão a tela anuncia "1/3" com 3 reais e aceita um
  // drop que o próprio hook recusa (rollback com toast).
  const kpiReal      = kpis(hook.items);
  const doingReal    = countDoing(hook.items);
  const byStatusReal = bucketByStatus(hook.items);

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
  // Fase F (auditoria): "reais" é literal — o filtro não muda o cabeçalho.
  const openCount = byStatusReal.backlog.length + byStatusReal.todo.length + byStatusReal.doing.length + byStatusReal.waiting.length;
  const subtitleAbertas = `${openCount.toLocaleString('pt-BR')} ${openCount === 1 ? 'aberta' : 'abertas'}`;
  const subtitleHoje = `${kpiReal.dueToday.toLocaleString('pt-BR')} para hoje`;

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

  // Etapa 26 (B3): abrir e fechar o Sheet mantém a URL em sincronia (`?task=<id>`).
  const abrirSheet = useCallback((item: WorkItem) => {
    setLinkConsumido(true);
    setSelectedItem(item);
    const url = new URL(window.location.href);
    url.searchParams.set('task', item.id);
    window.history.replaceState(null, '', url.pathname + url.search);
  }, []);

  const fecharSheet = useCallback(() => {
    setLinkConsumido(true);
    setSelectedItem(null);
    setFocusField(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, []);

  // Etapa 27: F5 com `?task=<id>` reabre o Sheet. Derivado (não é efeito):
  // o item vem da URL e some assim que o usuário fecha o Sheet.
  const itemDoLink = !linkConsumido && idNaUrl
    ? hook.items.find(i => i.id === idNaUrl) ?? null
    : null;
  const itemAberto = selectedItem ?? itemDoLink;

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
      <TasksKpiStrip kpis={{ ...kpiData, doingCount: doingReal }} />

      {/* QuickAdd (etapa 57: a Agenda tem o seu, com o dia selecionado) */}
      {mode !== 'agenda' && <QuickAdd ref={quickAddRef} onAdd={create} defaultStatus="backlog" />}

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
              filtersActive={filtros.isActive}
              onOpen={abrirSheet}
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
              doingCount={doingReal}
              onMove={move}
              onReorder={reorder}
              onOpen={abrirSheet}
              onDelete={deleteItem}
              onCreate={create}
            />
          )}
          {mode === 'agenda' && (
            <TasksAgendaMode
              items={items}
              overdue={byDue.overdue}
              isLoading={isLoading}
              onCreate={create}
              quickAddRef={quickAddRef}
              onOpen={abrirSheet}
              onToggleDone={handleToggleDone}
              onMoveTo={handleMoveTo}
              onDelete={deleteItem}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Etapa 26 (B3): clicar no card abre o Sheet de edição */}
      <WorkItemSheet
        item={itemAberto}
        open={itemAberto !== null}
        onOpenChange={(o) => { if (!o) fecharSheet(); }}
        onSave={(it, patch) => { void hook.update(it.id, patch); }}
        onMove={(it, to, waitingReason) => { void move(it, to, waitingReason ? { waitingReason } : undefined); }}
        onSnooze={(it, minutes) => { void hook.snooze(it, minutes); }}
        onSetReminder={(it, iso) => { void hook.setReminder(it, iso); }}
        onCancel={(it) => { void hook.cancel(it); }}
        contactOptions={contactOptions}
        doingCount={doingReal}
        focusField={focusField}
      />
    </div>
  );
}
