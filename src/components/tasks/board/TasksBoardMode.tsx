import { useCallback, useEffect, useRef, useState } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BoardColumn }      from './BoardColumn';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput, MoveOpts } from '@/hooks/tasks/useMyWorkItems';
import { KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { resolveDragEnd, type DragEndResolution } from './resolveDragEnd';
import { BOARD_ORDER, colunaVizinha, resolverMoverPorTeclado, bordasDeRolagem } from './boardInteracao';
import { useNarrowViewport, usePointerCoarse } from '../shared/pointerMedia';
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
  // Etapa 093: o toggle "Concluídas" mostra/oculta a COLUNA Concluído do Quadro
  // (o switch "Mostrar concluídas" da barra de filtros corta os ITENS, não a
  // coluna). Nasce ligado — o Quadro sempre mostrou as cinco colunas.
  const [mostrarConcluidas, setMostrarConcluidas] = useState(true);
  const colunasVisiveis = mostrarConcluidas
    ? BOARD_COLUMNS
    : BOARD_COLUMNS.filter(s => s !== 'done');
  const trilhoRef     = useRef<HTMLDivElement>(null);
  const [colunaVisivel, setColunaVisivel] = useState(0);
  // Etapa 098: sombras das bordas — só onde ainda há conteúdo escondido.
  const [bordas, setBordas] = useState({ esq: false, dir: false });

  /** Qual coluna está encostada à esquerda da faixa (o snap alinha por ali). */
  const aoRolar = useCallback(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    setBordas(bordasDeRolagem(trilho));
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
  }, []);

  /** Leva a faixa até a coluna pedida (setas, dots e abas). */
  const irParaColuna = useCallback((indice: number) => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    const alvo = trilho.children[indice] as HTMLElement | undefined;
    if (!alvo) return;
    // Etapa 099: a escolha vale na hora — o indicador (aba ativa, dot e setas)
    // não espera o evento de rolagem, que só chega depois do scroll (e que o
    // jsdom, sem layout, nem emite).
    setColunaVisivel(indice);
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

  const ultimaColuna = colunasVisiveis.length - 1;

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
            docs/design/TAREFAS_QUADRO_STATUS.md. */}
        <div className="flex w-full min-w-0 items-center justify-end gap-2" data-testid="board-toolbar">
          <button
            type="button"
            data-testid="board-done-toggle"
            aria-pressed={mostrarConcluidas}
            onClick={() => { setMostrarConcluidas(v => !v); setColunaVisivel(0); }}
            className={`h-8 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors ${
              mostrarConcluidas
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border/70 text-muted-foreground hover:bg-muted'
            }`}
          >
            Concluídas
          </button>
        </div>

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
            {/* Etapas 099/100: ABAS das colunas. Na tela estreita (uma coluna
                por vez) elas conduzem a faixa; o estilo do ativo é o D3 —
                preenchido com a cor primária —, a mesma linguagem do seletor
                de modos e do toggle ao lado. As setas e os dots de 081 seguem
                valendo para quem navega por teclado ou por toque. */}
            <div
              role="tablist"
              aria-label="Colunas do quadro"
              data-testid="board-tabs"
              className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto"
            >
              {colunasVisiveis.map((status, i) => {
                const ativo = colunaVisivel === i;
                return (
                  <button
                    key={status}
                    type="button"
                    role="tab"
                    data-testid={`board-tab-${i}`}
                    aria-selected={ativo}
                    onClick={() => irParaColuna(i)}
                    className={`h-8 shrink-0 rounded-lg px-3 text-xs font-medium transition-colors ${
                      ativo
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {rotuloDaColuna(status)}
                  </button>
                );
              })}
            </div>
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
            ainda há coluna escondida; `motion-safe:scroll-smooth` dá o encaixe
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
          {colunasVisiveis.map(status => (
            <BoardColumn
              key={status}
              status={status}
              items={byStatus[status] ?? []}
              isLoading={isLoading}
              doingCount={doingTotal}
              dragSourceStatus={dragSourceStatus}
              dragDisabled={dragDesligado}
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
            {colunasVisiveis.map((status, i) => (
              <button
                key={status}
                type="button"
                data-testid={`board-dot-${i}`}
                aria-label={`Ir para ${rotuloDaColuna(status)}`}
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
