import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Filter, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useMyWorkItems }   from '@/hooks/tasks/useMyWorkItems';
import { openContactChat }  from '@/components/catalog/useSendProduct';
import { applyFilters, bucketByDue, bucketByStatus, kpis } from '@/hooks/tasks/workItemAggregates';
import { countDoing } from '@/hooks/tasks/workItemMachine';
import { useTasksFilters }  from '@/hooks/tasks/useTasksFilters';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { WIP_LIMITS, KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput, MoveOpts } from '@/hooks/tasks/useMyWorkItems';
import { ModeSwitcher, type TaskMode } from './shared/ModeSwitcher';
import { QuickAdd }         from './shared/QuickAdd';
import { TasksFilterBar }   from './shared/TasksFilterBar';
import { TasksKpiStrip }    from './shared/TasksKpiStrip';
import { TasksListMode }    from './list/TasksListMode';
import { TasksBoardMode }   from './board/TasksBoardMode';
import { TasksAgendaMode }  from './agenda/TasksAgendaMode';
import { WorkItemSheet }    from './shared/WorkItemSheet';

const STORAGE_KEY = 'tasks-mode';

export function TasksModule() {
  const savedMode = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) as TaskMode) || 'list';
  const [mode, setModeState] = useState<TaskMode>(savedMode);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  /** Etapa 28 (B2): o Sheet aberto por DnD/kebab já vem pedindo o motivo.
   *  Etapa 31: o "Escolher…" do RemindChip abre focado no alarme. */
  const [focusField, setFocusField] = useState<'waiting_reason' | 'remind_at' | undefined>(undefined);
  /** Etapa 27: id lido da URL uma única vez, no primeiro render. */
  const [idNaUrl] = useState(() => new URLSearchParams(window.location.search).get('task'));
  const [linkConsumido, setLinkConsumido] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);
  /** Etapa 78: região viva (sr-only) que narra o que aconteceu na tela. */
  const [anuncio, setAnuncio] = useState('');

  // Repetir a mesma frase não muda o texto da região e o leitor de tela não
  // reanuncia; o espaço de largura zero força a troca sem mexer no que é lido.
  const anunciar = useCallback((mensagem: string) => {
    setAnuncio(prev => (prev === mensagem ? `${mensagem}\u200B` : mensagem));
  }, []);

  const setMode = (m: TaskMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  // B13: uma unica query para os tres modos. A query ja traz `done` dos ultimos
  // 30 dias; o recorte de 7 dias da Lista e local. Trocar de modo nao gera request.
  const hook = useMyWorkItems();
  const { isLoading, isError, create, move, reorder, complete, reopen, snooze, setReminder, deleteItem } = hook;

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

  // Etapa 79: com movimento reduzido a troca de modo nao anima — o AnimatePresence
  // continua montando/desmontando (o conteudo nao pode piscar), mas com 0s.
  const reduceMotion = useReducedMotion() ?? false;

  const handleToggleDone = useCallback(async (item: WorkItem) => {
    if (item.status === 'done') {
      await reopen(item);
      anunciar('Desfeito');
    } else {
      await complete(item);
      anunciar('Concluída');
    }
  }, [reopen, complete, anunciar]);

  // Etapa 26 (B3): abrir e fechar o Sheet mantém a URL em sincronia (`?task=<id>`).
  // Etapa 28/29/31: `focus` abre o Sheet já pedindo um campo — o motivo de espera
  // (portão do Aguardando) ou o alarme ("Escolher…" do RemindChip).
  const abrirSheet = useCallback((item: WorkItem, focus?: 'waiting_reason' | 'remind_at') => {
    setLinkConsumido(true);
    setSelectedItem(item);
    setFocusField(focus);
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

  // Etapa 77/78: "Movida para {coluna} ({n} de {limite})" — a contagem olha o
  // recorte real do alvo (a coluna com WIP duro é a que importa).
  const anunciarMovimento = useCallback((item: WorkItem, to: WorkItemStatus) => {
    const coluna = KANBAN_COLUMNS.find(c => c.status === to)?.label ?? to;
    const limite = WIP_LIMITS[to].hard;
    if (!limite) { anunciar(`Movida para ${coluna}`); return; }
    const n = Math.min(hook.items.filter(i => i.status === to && i.id !== item.id).length + 1, limite);
    anunciar(`Movida para ${coluna} (${n} de ${limite})`);
  }, [hook.items, anunciar]);

  // Etapa 29 (B2): mover para Aguardando nunca escreve direto — o motivo é
  // obrigatório, então o portão abre o Sheet pedindo (mesmo caminho do DnD).
  const handleMoveTo = useCallback((item: WorkItem, to: WorkItemStatus) => {
    if (to === 'waiting') { abrirSheet(item, 'waiting_reason'); return; }
    anunciarMovimento(item, to);
    void move(item, to);
  }, [move, abrirSheet, anunciarMovimento]);

  // O DnD do Quadro chama `onMove` direto: o mesmo aviso vale para as duas portas.
  const moverComAviso = useCallback((item: WorkItem, to: WorkItemStatus, opts?: MoveOpts) => {
    anunciarMovimento(item, to);
    void move(item, to, opts);
  }, [move, anunciarMovimento]);

  // Etapa 78: "Tarefa criada" cobre as três portas de captura (QuickAdd do
  // cabeçalho, da coluna e da Agenda).
  const criarComAviso = useCallback(async (input: WorkItemInput) => {
    await create(input);
    anunciar('Tarefa criada');
  }, [create, anunciar]);

  // Etapa 28: o DnD cai no mesmo portão quando solta em Aguardando sem motivo.
  const handleRequestWaitingReason = useCallback((item: WorkItem) => {
    abrirSheet(item, 'waiting_reason');
  }, [abrirSheet]);

  // Etapa 32: clique no contato do item abre a conversa no inbox — mesmo
  // mecanismo do produto (`open-contact-chat`, escutado em useRealtimeInbox).
  const handleOpenContact = useCallback((item: WorkItem) => {
    const contactId = item.contact?.id;
    if (contactId) openContactChat(contactId);
  }, []);

  // Etapas 30/31: ações do kebab e do RemindChip ligadas às mutations do hook.
  const handleComplete = useCallback((item: WorkItem) => {
    void complete(item).then(() => anunciar('Concluída'));
  }, [complete, anunciar]);
  const handleReopen = useCallback((item: WorkItem) => {
    void reopen(item).then(() => anunciar('Desfeito'));
  }, [reopen, anunciar]);
  const handleSnooze = useCallback((item: WorkItem, minutes: number | 'tomorrow9') => { void snooze(item, minutes); }, [snooze]);
  const handleClearReminder = useCallback((item: WorkItem) => { void setReminder(item, null); }, [setReminder]);
  const handleOpenReminder = useCallback((item: WorkItem) => { abrirSheet(item, 'remind_at'); }, [abrirSheet]);

  // Etapa 77: os 7 atalhos do módulo vivem no registry global
  // (`useGlobalKeyboardShortcuts` + `defaultShortcuts`), com escopo
  // `view === 'tasks'` e guarda de input. Aqui só chega o comando,
  // pelo evento `tasks-shortcut` — o módulo não instala listener de teclado.
  const aplicarAtalho = useCallback((id: string, key?: string) => {
    if (id === 'tasks-focus-quickadd') { quickAddRef.current?.focus(); return; }
    if (id === 'tasks-mode') {
      setMode(key === '2' ? 'board' : key === '3' ? 'agenda' : 'list');
      return;
    }
    if (id === 'tasks-search') {
      document.querySelector<HTMLInputElement>('[aria-label="Buscar tarefa"]')?.focus();
      return;
    }
    // `E`/`X`/`Delete` agem no card com foco (o mesmo contrato do próprio card).
    const idDoCard = (document.activeElement as HTMLElement | null)
      ?.closest?.('[data-testid="work-item-card"]')?.getAttribute('data-item-id');
    const item = idDoCard ? hook.items.find(i => i.id === idDoCard) ?? null : null;
    if (!item) return;
    if (id === 'tasks-open-sheet') abrirSheet(item);
    if (id === 'tasks-complete') void handleToggleDone(item);
    if (id === 'tasks-cancel') void deleteItem(item);
  }, [hook.items, abrirSheet, handleToggleDone, deleteItem]);

  // O handler fica numa ref para o listener não se remontar a cada render e sair
  // das deps do efeito (mesmo padrão do registry), sem `useEffect` + `setState`.
  const atalhoRef = useRef(aplicarAtalho);
  useEffect(() => { atalhoRef.current = aplicarAtalho; });
  useEffect(() => {
    const aoAtalhar = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string; key?: string }>).detail;
      if (detail?.id) atalhoRef.current(detail.id, detail.key);
    };
    document.addEventListener('tasks-shortcut', aoAtalhar);
    return () => document.removeEventListener('tasks-shortcut', aoAtalhar);
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
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--destructive-text))]" />
        <p className="text-sm text-muted-foreground">Não foi possível carregar suas tarefas</p>
        <button type="button" onClick={() => hook.refetch()} className="text-sm text-primary hover:underline">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div data-testid="tasks-module" className="flex flex-col h-full gap-4">
      {/* Etapa 78: região viva única do módulo — narra criar, concluir, mover e
          desfazer sem roubar o foco de quem usa leitor de tela. */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="tasks-live"
      >
        {anuncio}
      </div>
      <PageHeader
        variant="plain"
        title="Tarefas"
        subtitle={`${subtitleAbertas} · ${subtitleHoje}`}
        breadcrumbs={[{ label: 'Início', href: '/' }, { label: 'Tarefas' }]}
      />

      {/* KPIs (etapa 44: 5 cards de 88px no padrão ContactKpiCard) */}
      <TasksKpiStrip kpis={{ ...kpiData, doingCount: doingReal }} />

      {/* QuickAdd (etapa 57: a Agenda tem o seu, com o dia selecionado) */}
      {mode !== 'agenda' && <QuickAdd ref={quickAddRef} onAdd={criarComAviso} defaultStatus="backlog" />}

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
          transition={{ duration: reduceMotion ? 0 : 0.12 }}
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
              doingCount={doingReal}
              onOpenContact={handleOpenContact}
              onRequestWaitingReason={handleRequestWaitingReason}
              onComplete={handleComplete}
              onReopen={handleReopen}
              onSnooze={handleSnooze}
              onClearReminder={handleClearReminder}
              onOpenReminder={handleOpenReminder}
            />
          )}
          {mode === 'board' && (
            <TasksBoardMode
              byStatus={byStatus}
              byStatusFull={byStatusReal}
              isLoading={isLoading}
              doingCount={doingReal}
              onMove={moverComAviso}
              onMoveTo={handleMoveTo}
              onRequestWaitingReason={handleRequestWaitingReason}
              onReorder={reorder}
              onOpen={abrirSheet}
              onDelete={deleteItem}
              onCreate={criarComAviso}
              onOpenContact={handleOpenContact}
              onComplete={handleComplete}
              onReopen={handleReopen}
              onSnooze={handleSnooze}
              onClearReminder={handleClearReminder}
              onOpenReminder={handleOpenReminder}
            />
          )}
          {mode === 'agenda' && (
            <TasksAgendaMode
              items={items}
              overdue={byDue.overdue}
              isLoading={isLoading}
              onCreate={criarComAviso}
              quickAddRef={quickAddRef}
              onOpen={abrirSheet}
              onToggleDone={handleToggleDone}
              onMoveTo={handleMoveTo}
              onDelete={deleteItem}
              doingCount={doingReal}
              onOpenContact={handleOpenContact}
              onRequestWaitingReason={handleRequestWaitingReason}
              onComplete={handleComplete}
              onReopen={handleReopen}
              onSnooze={handleSnooze}
              onClearReminder={handleClearReminder}
              onOpenReminder={handleOpenReminder}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Etapa 26 (B3): clicar no card abre o Sheet de edição */}
      <WorkItemSheet
        item={itemAberto}
        open={itemAberto !== null}
        onOpenChange={(o) => { if (!o) fecharSheet(); }}
        onSave={(it, patch) => hook.update(it.id, patch)}
        onMove={(it, to, waitingReason) => move(it, to, waitingReason ? { waitingReason } : undefined)}
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
