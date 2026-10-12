import { useState } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WorkItemCard }         from '../shared/WorkItemCard';
import { BoardColumnSkeleton } from '../shared/BoardColumnSkeleton';
import { QuickAdd }             from '../shared/QuickAdd';
import { TasksEmptyState }      from '../TasksEmptyState';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput }   from '@/hooks/tasks/useMyWorkItems';
import { WIP_LIMITS, KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { splitDoneByRecency }   from '@/hooks/tasks/workItemAggregates';
import type { WorkItemCardActions } from '../shared/cardActions';
import { usePressaoLonga } from '../shared/pointerMedia';

const SUBTITULOS_COLUNA: Record<WorkItemStatus, string> = {
  backlog: 'Capture primeiro',
  todo: 'Próximo passo',
  doing: 'Até 3 agora',
  waiting: 'Com motivo',
  done: '7 dias à vista',
  cancelled: '',
};

interface Props extends WorkItemCardActions {
  status: WorkItemStatus;
  items: WorkItem[];
  isLoading: boolean;
  doingCount: number;
  /** Etapa 52 (B8): coluna de origem do arrasto em curso (null = nenhum). */
  dragSourceStatus: WorkItemStatus | null;
  /** Etapa 81: ponteiro grosso desliga o arrasto — quem move é o `MoveToMenu`. */
  dragDisabled?: boolean;
  /** Etapa 094: pressão longa compartilhada pelo trilho; ao armar, todos os alvos aceitam drop. */
  pressaoArrasto?: ReturnType<typeof usePressaoLonga>;
  /** Etapa 83: drop recusado por limite cheio dá um tranco curto na coluna de destino. */
  shake?: boolean;
  onOpen: (item: WorkItem) => void;
  onMoveTo: (item: WorkItem, to: WorkItemStatus) => void;
  onDelete: (item: WorkItem) => void;
  onCreate?: (input: WorkItemInput) => Promise<void>;
}

export function BoardColumn({
  status, items, isLoading, doingCount, dragSourceStatus, dragDisabled = false, pressaoArrasto, shake = false, onOpen, onMoveTo, onDelete, onCreate,
  onOpenContact, onRequestWaitingReason, onComplete, onReopen, onSnooze, onClearReminder, onOpenReminder,
}: Props) {
  const col   = KANBAN_COLUMNS.find(c => c.status === status)!;
  const subtitulo = SUBTITULOS_COLUNA[status];
  const limit = WIP_LIMITS[status];
  const hardFull  = limit.hard != null && doingCount >= limit.hard;
  const softOver  = limit.soft != null && items.length > limit.soft;
  // Etapa 082: o segmento visível nunca passa do teto — quem estourou o limite
  // (dado real > hard) continua pintando a barra CHEIA, não uma barra maior.
  const preenchidos = limit.hard != null ? Math.min(doingCount, limit.hard) : 0;
  // Etapa 094: no toque o arrasto só pega depois de uma pressão longa (a lib de
  // DnD respeita `isDragDisabled` na hora de levantar o cartão, então o swipe
  // continua sendo rolagem até a coluna estar armada).
  const pressaoLocal = usePressaoLonga();
  const pressao = pressaoArrasto ?? pressaoLocal;
  const arrastoBloqueado = dragDisabled && !pressao.armado;
  // Etapa 52 (B8): a coluna cheia continua aceitando o que veio dela mesma
  // (reorganizar dentro de "Fazendo" com 3/3), e recusa o que vem de fora.
  // Etapa 094: depois da pressão longa no toque, a coluna volta a aceitar a
  // soltura; antes `dragDisabled` mantinha o Droppable desligado até o fim.
  const isDropDisabled = arrastoBloqueado || (hardFull && dragSourceStatus !== status);

  // Etapa 096: com um arrasto em curso, a coluna Aguardando se realça em âmbar —
  // no toque isso só começa depois da pressão longa armar o arrasto.
  const realceEspera = (!dragDisabled || pressao.armado) && dragSourceStatus != null && status === 'waiting';
  // Etapa 095: a dica do alvo mostra a contagem do destino DEPOIS do drop (com o
  // teto do limite duro, nunca "4 de 3").
  const dicaSolta = limit.hard != null
    ? `Solte para mover para ${col.label} (${Math.min(doingCount + 1, limit.hard)} de ${limit.hard})`
    : `Solte para mover para ${col.label}`;

  // Etapa 51 (B5): a coluna Concluído mostra os 7 dias e revela o resto da janela
  // de 30 dias no rodapé "Ver mais antigas (30 dias)" (filtro local, sem query nova).
  const [showOlderDone, setShowOlderDone] = useState(false);
  const doneSplit = status === 'done' ? splitDoneByRecency(items) : null;
  const visibleItems = doneSplit
    ? (showOlderDone ? [...doneSplit.recent, ...doneSplit.older] : doneSplit.recent)
    : items;

  const headerCount = limit.hard
    ? `${doingCount}/${limit.hard}`
    : visibleItems.length > 0 ? String(visibleItems.length) : '';

  return (
    // E16: as colunas DIVIDEM a largura do trilho (`flex-1`) com um piso legível de 200px.
    // Antes eram fixas em 232px (260px no `xl`): as cinco somavam 1348px e não cabiam em
    // 1440 com sidebar aberta e gutter dos dois lados (1440 − 256 − 2×36 = 1112px).
    // Agora o piso do conjunto é 5×200 + 4×12 = 1048px, então cabe em 1440 sem rolagem.
    // Abaixo de 1048px de trilho, o flexbox não encolhe mais e o `overflow-x-auto` + snap
    // assume. As setas/‹› e os dots existem só no corte mobile de `pointerMedia.ts`
    // (`max-width: 767px`); em larguras intermediárias, a condução é o próprio scroll.
    <div
      data-board-column={status}
      {...(realceEspera ? { 'data-testid': 'board-waiting-emphasis' } : {})}
      className={[
        'flex flex-col flex-1 min-w-[200px] h-full min-h-0 rounded-[14px] border bg-card overflow-hidden snap-start',
        // Etapa 83: recusa por limite cheio — a BORDA muda sempre (o aviso não
        // depende de animação); o tranco curto só existe sem movimento reduzido.
        shake ? 'border-destructive motion-safe:animate-wiggle' : 'border-border/70',
        // Etapa 096: âmbar por dentro da borda, sem trocar a cor da coluna.
        realceEspera ? 'ring-2 ring-inset ring-warning/60' : '',
      ].join(' ')}
    >
      {/* cabeçalho sticky */}
      <div className={[
        'flex items-center gap-2 min-w-0 px-3 py-2 border-b border-border/50 bg-card/95 backdrop-blur',
        hardFull ? 'text-destructive' : softOver ? 'text-warning' : 'text-foreground',
        hardFull ? 'ring-1 ring-destructive/40' : '',
      ].join(' ')}>
        <span className="min-w-0 shrink-0 truncate text-[13px] font-semibold">{col.label}</span>
        {/* Etapa 080: o subtítulo curto fica à vista; a política longa continua no tooltip do ⓘ. */}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{subtitulo}</span>
        {headerCount && (
          <span className={`shrink-0 text-xs font-bold tabular-nums ${hardFull ? 'text-destructive' : ''}`}>
            {headerCount}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="min-h-[24px] min-w-[24px] max-md:min-h-[44px] max-md:min-w-[44px] rounded flex items-center justify-center hover:bg-muted" aria-label="Política da coluna">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px] text-xs">
            {col.policy}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Etapa 082: barra de progresso segmentada do limite — azul (primária) até
          encher, destrutiva quando cheia. Um segmento por vaga do limite duro. */}
      {limit.hard != null && (
        <div className="px-3 pt-2" data-testid={`col-limit-bar-${status}`}>
          <div
            className="flex gap-1"
            role="progressbar"
            aria-label={`Limite de ${col.label}`}
            aria-valuemin={0}
            aria-valuemax={limit.hard}
            aria-valuenow={preenchidos}
          >
            {Array.from({ length: limit.hard }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < preenchidos ? (hardFull ? 'bg-destructive' : 'bg-primary') : 'bg-muted'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* QuickAdd na coluna Backlog */}
      {status === 'backlog' && onCreate && (
        <div className="px-2 pt-2">
          <QuickAdd onAdd={onCreate} defaultStatus="backlog" compact placeholder="Capturar tarefa…" />
        </div>
      )}

      {/* cards */}
      <Droppable droppableId={status} isDropDisabled={isDropDisabled}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            onPointerDown={pressao.aoPressionar}
            onPointerUp={pressao.aoSoltar}
            onPointerCancel={pressao.aoSoltar}
            className={`flex-1 min-w-0 overflow-y-auto p-2 space-y-1.5 min-h-[80px] ${snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-inset ring-primary' : ''}`}
          >
            {/* Etapa 094: no toque a coluna precisa avisar que o arrasto pede
                pressão longa — sem isso o gesto morre na rolagem. */}
            {dragDisabled && (
              <p
                data-testid="board-longpress-hint"
                className="px-1 pb-1 text-[11px] text-muted-foreground"
              >
                {pressao.armado ? 'Arraste o cartão' : 'Pressione e segure para arrastar'}
              </p>
            )}
            {/* Etapa 095: alvo de soltura — a coluna em foco ganha a borda primary
                (o ring) e a dica diz para onde e como a contagem fica. */}
            {snapshot.isDraggingOver && (
              <p
                data-testid="board-drop-target"
                className="rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-foreground"
              >
                {dicaSolta}
              </p>
            )}
            {isLoading && <BoardColumnSkeleton />}
            {/* Fase F (auditoria): com concluídas de 8 a 30 dias atrás do rodapé a
                coluna NÃO está vazia — antes ela mostrava "Coluna vazia" e o
                "Ver mais antigas (30 dias)" ao mesmo tempo. */}
            {!isLoading && visibleItems.length === 0 && (doneSplit?.older.length ?? 0) === 0 && (
              <TasksEmptyState variant="column" policy={col.policy} />
            )}
            {!isLoading && visibleItems.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={arrastoBloqueado}>
                {(drag, snap) => (
                  // Etapa 094: o cartao levantado ganha o overlay elevado
                  // (`--shadow-lg`) — a sombra do card comum continua sendo a dele.
                  <div
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    {...(snap.isDragging ? { 'data-testid': 'drag-overlay' } : {})}
                    className={snap.isDragging ? 'rounded-[14px] shadow-[var(--shadow-lg)]' : ''}
                  >
                    <WorkItemCard
                      item={item}
                      mode="board"
                      isDragging={snap.isDragging}
                      dragHandleProps={drag.dragHandleProps ?? undefined}
                      onOpen={() => onOpen(item)}
                      onMoveTo={(to) => onMoveTo(item, to)}
                      onDelete={() => onDelete(item)}
                      contactName={item.contact?.name ?? undefined}
                      onOpenContact={onOpenContact ? () => onOpenContact(item) : undefined}
                      onRequestWaitingReason={onRequestWaitingReason ? () => onRequestWaitingReason(item) : undefined}
                      doingCount={doingCount}
                      onComplete={onComplete ? () => onComplete(item) : undefined}
                      onReopen={onReopen ? () => onReopen(item) : undefined}
                      onSnooze={onSnooze ? (minutes) => onSnooze(item, minutes) : undefined}
                      onClearReminder={onClearReminder ? () => onClearReminder(item) : undefined}
                      onOpenReminder={onOpenReminder ? () => onOpenReminder(item) : undefined}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {!isLoading && doneSplit && doneSplit.older.length > 0 && (
              <button
                type="button"
                onClick={() => setShowOlderDone(s => !s)}
                className="w-full rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                {showOlderDone ? 'Ver menos' : 'Ver mais antigas (30 dias)'}
              </button>
            )}
            {/* Etapa 094: o lugar da soltura vira um rasgo tracejado enquanto o
                arrasto esta por cima. */}
            <div
              data-testid="board-drop-placeholder"
              className={snapshot.isDraggingOver ? 'rounded-[14px] border-2 border-dashed border-primary/60 p-1' : ''}
            >
              {provided.placeholder}
            </div>
          </div>
        )}
      </Droppable>

      {/* Etapa 082: rodapé do limite — a regra em palavras, não só o número. */}
      {limit.hard != null && (
        <div
          data-testid={`col-limit-footer-${status}`}
          className="flex items-center gap-1.5 border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground"
        >
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Seu limite é de {limit.hard} tarefas em execução.</span>
        </div>
      )}
    </div>
  );
}
