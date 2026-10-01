import { ArrowRightLeft } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { KANBAN_COLUMNS, WIP_LIMITS } from '@/hooks/tasks/workItem.types';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** Limite duro de "Fazendo" (etapa 29/33) — o mesmo que trava o DnD. */
const LIMITE_FAZENDO = WIP_LIMITS.doing.hard ?? 3;

interface Props {
  item: WorkItem;
  /** Contagem REAL de "Fazendo" (lista não filtrada) — trava a opção quando cheia. */
  doingCount?: number;
  /** Move direto: todas as colunas, menos "Aguardando" sem motivo. */
  onMoveTo?: (to: WorkItemStatus) => void;
  /** "Aguardando" sem motivo: abre o Sheet no campo motivo (etapa 29). */
  onRequestWaitingReason?: () => void;
}

/**
 * Etapa 33: as 5 opções de "Mover para" com as mesmas regras do kebab —
 * a coluna atual fica desabilitada e "Fazendo" fica desabilitado com o texto de
 * cheio quando a WIP estourou. Componente (não helper exportado) para o
 * `WorkItemCard` reusar o submenu sem duplicar regra nem quebrar o
 * `react-refresh/only-export-components`.
 */
export function MoveTargets({ item, doingCount = 0, onMoveTo, onRequestWaitingReason }: Props) {
  const fazendoCheio = doingCount >= LIMITE_FAZENDO;

  const mover = (to: WorkItemStatus) => {
    if (to === item.status) return;
    if (to === 'waiting' && !item.waiting_reason && onRequestWaitingReason) {
      onRequestWaitingReason();
      return;
    }
    onMoveTo?.(to);
  };

  return (
    <>
      {KANBAN_COLUMNS.map(c => {
        const atual = c.status === item.status;
        const bloqueadaPorWip = c.status === 'doing' && !atual && fazendoCheio;
        const desabilitada = atual || bloqueadaPorWip;
        const motivoCheio = bloqueadaPorWip ? `Fazendo está cheio (${doingCount}/${LIMITE_FAZENDO})` : undefined;
        return (
          <DropdownMenuItem
            key={c.status}
            disabled={desabilitada}
            aria-disabled={desabilitada ? 'true' : undefined}
            aria-label={motivoCheio}
            title={motivoCheio}
            onClick={(e) => { e.stopPropagation(); mover(c.status); }}
          >
            {c.shortLabel}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

/** Ponteiro grosso (touch): onde o DnD não é confortável e o menu faz o trabalho. */
function ponteiroGrosso(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Etapa 33/82: botão `ArrowRightLeft` no card, SÓ sob `pointer: coarse` — em
 * ponteiro fino o arrasto já resolve e o menu não aparece. Abre as 5 colunas.
 */
export function MoveToMenu({ item, doingCount = 0, onMoveTo, onRequestWaitingReason }: Props) {
  if (!ponteiroGrosso()) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="move-to-menu"
          aria-label="Mover para"
          title="Mover para"
          onClick={(e) => e.stopPropagation()}
          className="h-6 w-6 shrink-0 rounded-md hover:bg-muted flex items-center justify-center"
        >
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <MoveTargets
          item={item}
          doingCount={doingCount}
          onMoveTo={onMoveTo}
          onRequestWaitingReason={onRequestWaitingReason}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
