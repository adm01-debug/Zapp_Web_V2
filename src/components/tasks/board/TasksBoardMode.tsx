import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BoardColumn }      from './BoardColumn';
import { BoardDueColumn }   from './BoardDueColumn';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput, MoveOpts } from '@/hooks/tasks/useMyWorkItems';
import { KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { boardDueColumns } from '@/hooks/tasks/workItemBoardGroups';
import { resolveDragEnd, type DragEndResolution } from './resolveDragEnd';
import { BOARD_ORDER, colunaVizinha, resolverMoverPorTeclado, bordasDeRolagem } from './boardInteracao';
import { useNarrowViewport, usePointerCoarse, usePressaoLonga } from '../shared/pointerMedia';
import type { WorkItemCardActions } from '../shared/cardActions';

interface Props extends WorkItemCardActions {
  byStatus: Record<WorkItemStatus, WorkItem[]>;
  isLoading: boolean;
  /** Fase F (auditoria): contagem REAL de "Fazendo" (lista não filtrada) — é ela
   *  que vale para a trava de WIP. Sem a prop, cai na própria coluna visível. */
  doingCount?: number;
  /** R2-MOD-055 (#423): as colunas SEM o recorte do filtro (lista completa do
   *  hook). Sem ela o arrasto usa o índice do recorte visível, que a persistência
   *  reusa na coluna inteira — o item cai onde o usuário não soltou. */
  byStatusFull?: Record<WorkItemStatus, WorkItem[]>;
  onMove: (item: WorkItem, to: WorkItemStatus, opts?: MoveOpts) => void;
  /** Etapa 29: o kebab/menu do card passa pelo portão do Aguardando. */
  onMoveTo?: (item: WorkItem, to: WorkItemStatus) => void;
  /** Etapa 28: DnD para Aguardando sem motivo abre o Sheet pedindo o motivo. */
  onRequestWaitingReason?: (item: WorkItem) => void;
  onReorder: (positions: Array<{ id: string; position: number }>) => void;
  onOpen: (item: WorkItem) => void;
  onDelete: (item: WorkItem) => void;
  onCreate: (input: WorkItemInput) => Promise<void>;
}

// Etapa 094: as colunas do trilho na ordem — a mesma fonte do `boardInteracao`.
const BOARD_COLUMNS: WorkItemStatus[] = BOARD_ORDER;

/**
 * Etapa 102 (D1): como o Quadro agrupa as colunas. `estado` é o padrão (imagem 05);
 * `prazo` é a alternância opcional (imagem 03, etapa 101) e é **somente leitura**.
 */
type BoardGroupMode = 'estado' | 'prazo';

/** Preferência do agrupamento do Quadro (mesmo padrão do `tasks-mode`). */
const BOARD_GROUP_STORAGE_KEY = 'tasks-board-group';

/** Botão-pílula da barra (alvo de 40 px); ativo com o mesmo realce da etapa 093. */
const classeDoBotao = (ativo: boolean) =>
  `min-h-10 min-w-10 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors ${
    ativo ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-muted'
  }`;

/** Lê a preferência salva; qualquer valor que não seja `prazo` cai em `estado`. */
function lerAgrupamentoSalvo(): BoardGroupMode {
  if (typeof localStorage === 'undefined') return 'estado';
  return localStorage.getItem(BOARD_GROUP_STORAGE_KEY) === 'prazo' ? 'prazo' : 'estado';
}

/** Rótulo da coluna na faixa de navegação (mesma fonte das colunas). */
function rotuloDaColuna(status: WorkItemStatus): string {
  return KANBAN_COLUMNS.find(c => c.status === status)?.label ?? status;
}


export function TasksBoardMode({
  byStatus, isLoading, doingCount, byStatusFull, onMove, onMoveTo, onRequestWaitingReason, onReorder, onOpen, onDelete, onCreate,
  onOpenContact, onComplete, onReopen, onSnooze, onClearReminder, onOpenReminder,
}: Props) {
  const doingTotal = doingCount ?? byStatus.doing.length;
  // Etapa 52 (B8): guarda de onde o arrasto COMECOU — sem isso a coluna "Fazendo"
  // cheia bloqueia ate a reorganizacao dela mesma.
  const [dragSourceStatus, setDragSourceStatus] = useState<WorkItemStatus | null>(null);
  // Etapa 83: coluna que levou o tranco do último drop recusado por limite cheio.
  const [colunaTremendo, setColunaTremendo] = useState<WorkItemStatus | null>(null);
  const tremorTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (tremorTimer.current !== null) window.clearTimeout(tremorTimer.current);
  }, []);

  /** Dá o tranco curto na coluna de destino e o desfaz sozinho (o drop não move nada). */
  const tremerColuna = useCallback((alvo: WorkItemStatus) => {
    setColunaTremendo(alvo);
    if (tremorTimer.current !== null) window.clearTimeout(tremorTimer.current);
    tremorTimer.current = window.setTimeout(() => setColunaTremendo(null), 600);
  }, []);
  // Etapa 81: no ponteiro grosso o arrasto sai de cena e o `MoveToMenu` do card
  // assume; na tela estreita as setas e os dots conduzem a faixa de colunas.
  const dragDesligado = usePointerCoarse();
  const telaEstreita  = useNarrowViewport();
  const pressaoArrasto = usePressaoLonga();
  // Etapa 093: o toggle "Concluídas" mostra/oculta a COLUNA Concluído do Quadro
  // (o switch "Mostrar concluídas" da barra de filtros corta os ITENS, não a
  // coluna). Nasce ligado — o Quadro sempre mostrou as cinco colunas.
  const [mostrarConcluidas, setMostrarConcluidas] = useState(true);
  const colunasVisiveis = mostrarConcluidas
    ? BOARD_COLUMNS
    : BOARD_COLUMNS.filter(s => s !== 'done');
  const trilhoRef     = useRef<HTMLDivElement>(null);
  const [colunaVisivel, setColunaVisivel] = useState(0);
  // Etapa 102 (D1): o agrupamento do Quadro, persistido como o modo do módulo —
  // a leitura acontece só na montagem (sem efeito).
  const [agruparPor, setAgruparPor] = useState<BoardGroupMode>(lerAgrupamentoSalvo);
  const porPrazo = agruparPor === 'prazo';

  /** Troca o agrupamento, grava a preferência e devolve a faixa à 1ª coluna. */
  const trocarAgrupamento = useCallback((modo: BoardGroupMode) => {
    setAgruparPor(modo);
    setColunaVisivel(0);
    if (typeof localStorage !== 'undefined') localStorage.setItem(BOARD_GROUP_STORAGE_KEY, modo);
  }, []);

  // Etapa 102: o recorte por prazo sai da MESMA lista do Quadro (B13, sem
  // consulta nova) e, com a lista completa em mãos, o agrupamento conta o mesmo
  // conjunto que o arrasto das colunas por estado.
  const itensDoQuadro = useMemo(
    () => Object.values(byStatusFull ?? byStatus).flat(),
    [byStatus, byStatusFull],
  );
  const colunasPrazo = useMemo(() => boardDueColumns(itensDoQuadro), [itensDoQuadro]);
  /** Rótulos na ordem renderizada — a faixa estreita (81/99) serve aos dois agrupamentos. */
  const rotulosDasColunas = porPrazo
    ? colunasPrazo.map(c => c.label)
    : colunasVisiveis.map(rotuloDaColuna);
  // Etapa 098: sombras das bordas — só onde ainda há conteúdo escondido.
  const [bordas, setBordas] = useState({ esq: false, dir: false });

  /** Mede as sombras de borda sem depender de um scroll do usuário. */
  const atualizarBordas = useCallback(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    setBordas(bordasDeRolagem(trilho));
  }, []);

  /** Qual coluna está encostada à esquerda da faixa (o snap alinha por ali). */
  const aoRolar = useCallback(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    atualizarBordas();
    const base = trilho.getBoundingClientRect().left;
    let indice = 0;
    let menorDistancia = Number.POSITIVE_INFINITY;
    Array.from(trilho.children).forEach((coluna, i) => {
      const distancia = Math.abs(coluna.getBoundingClientRect().left - base);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        indice = i;
      }
    });
    setColunaVisivel(indice);
  }, [atualizarBordas]);

  useEffect(() => {
    atualizarBordas();
    const trilho = trilhoRef.current;
    const aoRedimensionar = () => atualizarBordas();
    window.addEventListener('resize', aoRedimensionar);
    const Observador = typeof ResizeObserver === 'undefined' ? null : ResizeObserver;
    const observador = trilho && Observador ? new Observador(aoRedimensionar) : null;
    if (trilho && observador) observador.observe(trilho);
    return () => {
      window.removeEventListener('resize', aoRedimensionar);
      observador?.disconnect();
    };
  }, [atualizarBordas]);

  /** Leva a faixa até a coluna pedida (setas e dots). */
  const irParaColuna = useCallback((indice: number) => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    const alvo = trilho.children[indice] as HTMLElement | undefined;
    if (!alvo) return;
    const deslocamento = alvo.getBoundingClientRect().left - trilho.getBoundingClientRect().left;
    const destino = trilho.scrollLeft + deslocamento;
    // `scrollTo` anima no navegador; ambientes sem ele (jsdom) não podem quebrar o clique.
    if (typeof trilho.scrollTo === 'function') trilho.scrollTo({ left: destino, behavior: 'smooth' });
    else trilho.scrollLeft = destino;
  }, []);

  // Etapa 87: a decisão do arrasto (portão do Aguardando + trava de WIP 3/3) saiu
  // daqui para `resolveDragEnd` (função pura, em .ts); este handler só interpreta.
  //
  // Etapa 097: o teclado (Alt+←/→) passa pela MESMA decisão — `aplicarDecisao` é o
  // único lugar que interpreta, então teclado e arrasto não podem divergir.
  const aplicarDecisao = useCallback((decisao: DragEndResolution | null, alvoTranco?: WorkItemStatus) => {
    if (!decisao) return;
    switch (decisao.action) {
      case 'reorder':
        onReorder(decisao.positions);
        return;
      case 'need_reason':
        // Etapa 28 (B2): Aguardando sem motivo não escreve no banco — abre o Sheet
        // já pedindo o motivo (o card volta à origem por conta da lib).
        onRequestWaitingReason?.(decisao.item);
        return;
      case 'blocked':
        if (decisao.reason === 'wip_full') {
          // Etapa 83: o card volta à origem (a lib cancela o drop) e a coluna de
          // destino leva o tranco curto — a borda avisa mesmo sem animação.
          toast.error('Fazendo está cheio (máx. 3). Conclua um item antes.');
          if (alvoTranco) tremerColuna(alvoTranco);
        }
        return;
      case 'move':
        // etapa 15: leva o indice de destino para persistir a ordem das duas colunas
        onMove(decisao.item, decisao.to, decisao.opts);
        return;
    }
  }, [onMove, onRequestWaitingReason, onReorder, tremerColuna]);

  const handleDragEnd = useCallback((result: DropResult) => {
    setDragSourceStatus(null);
    aplicarDecisao(
      resolveDragEnd(result, byStatus, doingCount, byStatusFull),
      result.destination?.droppableId as WorkItemStatus | undefined,
    );
  }, [aplicarDecisao, byStatus, byStatusFull, doingCount]);

  /**
   * Etapa 097 — teclado do Quadro. Com o foco num cartão: ←/→ andam entre
   * colunas (pulando as vazias), ↑/↓ andam entre os cartões da coluna,
   * Alt+←/→ movem o cartão pela decisão de sempre e Enter é do próprio card
   * (`WorkItemCard` já abre no Enter). Com um arrasto em curso quem conduz as
   * setas é a própria lib de DnD, então aqui o handler se retira.
   */
  const handleTeclado = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const trilho = trilhoRef.current;
    if (!trilho || dragSourceStatus) return;
    const foco = e.target as HTMLElement;
    const cartao = foco.closest?.('[data-item-id]') as HTMLElement | null;
    // só o próprio cartão conduz: seta dentro do kebab/checkbox é daquele controle
    if (!cartao || cartao !== foco) return;
    const status = cartao.closest('[data-board-column]')?.getAttribute('data-board-column') as WorkItemStatus | null;
    if (!status) return;
    const daColuna = (s: WorkItemStatus) =>
      Array.from(trilho.querySelectorAll<HTMLElement>(`[data-board-column="${s}"] [data-item-id]`));
    const cartoes = daColuna(status);
    const indice = cartoes.indexOf(cartao);
    const passo: -1 | 1 | 0 = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;

    if (passo !== 0 && e.altKey) {
      const vizinha = colunaVizinha(status, passo);
      if (!vizinha) return;
      e.preventDefault();
      const item = (byStatus[status] ?? []).find(it => it.id === cartao.getAttribute('data-item-id'));
      if (!item) return;
      aplicarDecisao(
        resolverMoverPorTeclado(item, vizinha, byStatus, doingCount, byStatusFull),
        vizinha,
      );
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const destino = cartoes[indice + (e.key === 'ArrowDown' ? 1 : -1)];
      if (!destino) return;
      e.preventDefault();
      destino.focus();
      return;
    }

    if (passo !== 0) {
      let s = colunaVizinha(status, passo);
      while (s) {
        const alvo = daColuna(s);
        if (alvo.length) {
          e.preventDefault();
          alvo[Math.min(indice, alvo.length - 1)].focus();
          return;
        }
        s = colunaVizinha(s, passo);
      }
    }
  }, [aplicarDecisao, byStatus, byStatusFull, doingCount, dragSourceStatus]);

  const ultimaColuna = rotulosDasColunas.length - 1;

  return (
    <DragDropContext
      onDragEnd={handleDragEnd}
      onDragStart={start => setDragSourceStatus(start.source.droppableId as WorkItemStatus)}
      dragHandleUsageInstructions="Pressione espaço para pegar a tarefa, use as setas para movê-la e espaço de novo para soltar. Esc cancela o movimento."
    >
      <div className="flex w-full min-w-0 flex-col h-full min-h-0 gap-2">
        {/* Etapas 092/093: o toggle "Concluídas" do Quadro. Ligado (padrão) a
            coluna Concluído aparece; desligado ela sai do trilho. É diferente do
            switch "Mostrar concluídas" da barra de filtros, que corta os ITENS da
            consulta — aqui o que muda é a COLUNA. Sem "ordenar coluna": a posição
            manual e a ordem por data de conclusão são as decisões de
            docs/design/TAREFAS_QUADRO_STATUS.md.
            Etapa 102 (D1): a barra ganha o "Agrupar por: Estado | Prazo" — o
            "Concluídas" é do agrupamento por estado (a coluna por prazo já traz
            as concluídas de 7 dias), por isso ele só aparece em Estado. */}
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2" data-testid="board-toolbar">
          <div className="flex items-center gap-1.5" role="group" aria-label="Agrupar por" data-testid="board-group-toggle">
            <span className="text-xs text-muted-foreground">Agrupar por:</span>
            {(['estado', 'prazo'] as const).map(modo => (
              <button
                key={modo}
                type="button"
                data-testid={`board-group-${modo}`}
                aria-pressed={agruparPor === modo}
                onClick={() => trocarAgrupamento(modo)}
                className={classeDoBotao(agruparPor === modo)}
              >
                {modo === 'estado' ? 'Estado' : 'Prazo'}
              </button>
            ))}
          </div>
          {/* Etapa 093: o "Concluídas" é do agrupamento por estado (o por prazo já
              traz as concluídas de 7 dias) — no prazo ele sai de cena. */}
          {!porPrazo && (
          <button
            type="button"
            data-testid="board-done-toggle"
            aria-pressed={mostrarConcluidas}
            onClick={() => { setMostrarConcluidas(v => !v); setColunaVisivel(0); }}
            className={classeDoBotao(mostrarConcluidas)}
          >
            Concluídas
          </button>
          )}
        </div>

        {/* Etapa 102: o agrupamento por prazo é SOMENTE LEITURA (D1) — a dica
            diz, à vista, por que a alça de arrasto sumiu e o que usar no lugar. */}
        {porPrazo && (
          <p data-testid="board-due-hint" className="w-full min-w-0 text-[11px] text-muted-foreground">
            Agrupamento por prazo é somente leitura: arrastar fica desligado — para mover uma tarefa, use o menu do cartão.
          </p>
        )}

        {/* Etapa 81: setas ‹ › — só na tela estreita, onde as 5 colunas não cabem */}
        {telaEstreita && (
          <div className="flex w-full min-w-0 items-center gap-2" data-testid="board-nav">
            <button
              type="button"
              data-testid="board-prev"
              aria-label="Coluna anterior"
              disabled={colunaVisivel === 0}
              onClick={() => irParaColuna(colunaVisivel - 1)}
              className="h-8 w-8 shrink-0 rounded-lg border border-border/70 flex items-center justify-center transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex-1 min-w-0 truncate text-center text-[13px] font-semibold text-foreground">
              {rotulosDasColunas[Math.min(colunaVisivel, ultimaColuna)]}
            </span>
            <button
              type="button"
              data-testid="board-next"
              aria-label="Próxima coluna"
              disabled={colunaVisivel === ultimaColuna}
              onClick={() => irParaColuna(colunaVisivel + 1)}
              className="h-8 w-8 shrink-0 rounded-lg border border-border/70 flex items-center justify-center transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Etapa 098: o trilho embrulhado pelas sombras de borda — elas marcam onde
            ainda ha coluna escondida; `motion-safe:scroll-smooth` da o encaixe
            animado do snap (etapa 094) e respeita quem pediu menos movimento. */}
        <div className="relative flex-1 min-h-0 flex w-full min-w-0">
          {bordas.esq && (
            <div
              data-testid="board-scroll-shadow-left"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent"
            />
          )}
          {bordas.dir && (
            <div
              data-testid="board-scroll-shadow-right"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent"
            />
          )}
          <div
            ref={trilhoRef}
            onScroll={aoRolar}
            onKeyDown={handleTeclado}
            className="flex w-full min-w-0 gap-3 h-full overflow-x-auto snap-x snap-mandatory motion-safe:scroll-smooth pb-4"
          >
          {porPrazo
            ? colunasPrazo.map(col => (
              <BoardDueColumn
                key={col.key}
                columnKey={col.key}
                label={col.label}
                items={col.items}
                isLoading={isLoading}
                onOpen={onOpen}
                onMoveTo={(it, to) => (onMoveTo ?? onMove)(it, to)}
                onDelete={onDelete}
                onOpenContact={onOpenContact}
                onRequestWaitingReason={onRequestWaitingReason}
                onComplete={onComplete}
                onReopen={onReopen}
                onSnooze={onSnooze}
                onClearReminder={onClearReminder}
                onOpenReminder={onOpenReminder}
              />
            ))
            : colunasVisiveis.map(status => (
              <BoardColumn
                key={status}
                status={status}
                items={byStatus[status] ?? []}
                isLoading={isLoading}
                doingCount={doingTotal}
                dragSourceStatus={dragSourceStatus}
                dragDisabled={dragDesligado}
                pressaoArrasto={pressaoArrasto}
                shake={colunaTremendo === status}
                onOpen={onOpen}
                onMoveTo={(it, to) => (onMoveTo ?? onMove)(it, to)}
                onDelete={onDelete}
                onCreate={status === 'backlog' ? onCreate : undefined}
                onOpenContact={onOpenContact}
                onRequestWaitingReason={onRequestWaitingReason}
                onComplete={onComplete}
                onReopen={onReopen}
                onSnooze={onSnooze}
                onClearReminder={onClearReminder}
                onOpenReminder={onOpenReminder}
              />
            ))}
          </div>
        </div>

        {/* Etapa 81: 5 dots — indicador de página (só na tela estreita) */}
        {telaEstreita && (
          <div className="flex w-full items-center justify-center gap-1.5" data-testid="board-dots">
            {rotulosDasColunas.map((rotulo, i) => (
              <button
                key={rotulo}
                type="button"
                data-testid={`board-dot-${i}`}
                aria-label={`Ir para ${rotulo}`}
                aria-current={colunaVisivel === i ? 'true' : undefined}
                onClick={() => irParaColuna(i)}
                className={`h-1.5 rounded-full transition-all ${
                  colunaVisivel === i ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </DragDropContext>
  );
}
