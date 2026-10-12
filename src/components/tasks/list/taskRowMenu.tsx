import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoveTargets } from '../board/MoveToMenu';
import { aceitaLembrete, MOTIVO_SEM_LEMBRETE } from '../shared/cardActions';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

export interface TaskRowMenuProps {
  item: WorkItem;
  /** "Abrir" — o mesmo `onOpen` do clique na linha. */
  onOpen?: (item: WorkItem) => void;
  /** "Concluir" do kebab (item aberto). */
  onComplete?: (item: WorkItem) => void;
  /** "Reabrir" do kebab (item concluído/cancelado). */
  onReopen?: (item: WorkItem) => void;
  /** "Mover para ▸" — as regras vêm do `MoveTargets`, não de uma cópia. */
  onMoveTo?: (item: WorkItem, to: WorkItemStatus) => void;
  /** Contagem REAL de "Fazendo": com 3/3 o submenu trava a coluna. */
  doingCount?: number;
  /** "Mover para ▸ Aguardando" sem motivo abre o detalhe no campo do motivo. */
  onRequestWaitingReason?: (item: WorkItem) => void;
  /** "Lembrar-me ▸ 15 min · 1 h · Amanhã 9h". */
  onSnooze?: (item: WorkItem, minutes: number | 'tomorrow9') => void;
  /** "Lembrar-me ▸ Remover alarme". */
  onClearReminder?: (item: WorkItem) => void;
  /** "Lembrar-me ▸ Escolher…" — abre o detalhe no campo do alarme. */
  onOpenReminder?: (item: WorkItem) => void;
  /** "Cancelar" (D8: remover virou cancelar, com desfazer). */
  onDelete?: (item: WorkItem) => void;
}

/**
 * Etapa 061 — o menu ⋮ da LINHA da Lista em tabela.
 *
 * São os mesmos cinco grupos do kebab do card (Abrir · Concluir/Reabrir ·
 * Lembrar-me ▸ · Mover para ▸ · Cancelar) e as MESMAS ações que o `TasksModule`
 * já entrega ao modo Lista (`cardActions`): a tabela não inventa ação nova, só
 * a terceira porta para as que já existem (clique na linha, coluna Estado e,
 * agora, o menu).
 *
 * O gatilho fica DENTRO da célula Tarefa e todo clique nele (gatilho e
 * conteúdo) faz `stopPropagation`: o clique de dentro do menu não pode abrir os
 * detalhes da linha (etapa 063). O conteúdo é portaled, mas o evento sobe pela
 * árvore React até a linha — daí o `stopPropagation` explícito no conteúdo.
 */
export function TaskRowMenu({
  item,
  onOpen,
  onComplete,
  onReopen,
  onMoveTo,
  doingCount,
  onRequestWaitingReason,
  onSnooze,
  onClearReminder,
  onOpenReminder,
  onDelete,
}: TaskRowMenuProps) {
  const concluido = item.status === 'done' || item.status === 'cancelled';
  // #425 / R2-MOD-057: em estado terminal o executor do alarme ignora a tarefa —
  // a opção fica desabilitada com o motivo, em vez de anunciar um aviso morto.
  const lembreteElegivel = aceitaLembrete(item.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="row-menu"
          aria-label="Mais opções"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onClick={() => onOpen?.(item)}>Abrir</DropdownMenuItem>
        <DropdownMenuItem onClick={() => { if (concluido) onReopen?.(item); else onComplete?.(item); }}>
          {concluido ? 'Reabrir' : 'Concluir'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            disabled={!lembreteElegivel}
            aria-disabled={lembreteElegivel ? undefined : 'true'}
            aria-label={lembreteElegivel ? undefined : `Lembrar-me — ${MOTIVO_SEM_LEMBRETE}`}
            title={lembreteElegivel ? undefined : MOTIVO_SEM_LEMBRETE}
            className={lembreteElegivel ? undefined : 'pointer-events-none opacity-50'}
          >
            Lembrar-me
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onSnooze?.(item, 15)}>15 min</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze?.(item, 60)}>1 h</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze?.(item, 'tomorrow9')}>Amanhã 9h</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenReminder?.(item)}>Escolher…</DropdownMenuItem>
            {item.remind_at && (
              <DropdownMenuItem onClick={() => onClearReminder?.(item)}>Remover alarme</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Mover para</DropdownMenuSubTrigger>
          <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
            <MoveTargets
              item={item}
              doingCount={doingCount}
              onMoveTo={(to) => onMoveTo?.(item, to)}
              onRequestWaitingReason={() => onRequestWaitingReason?.(item)}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete?.(item)}
          className="text-[hsl(var(--destructive-text))] focus:text-[hsl(var(--destructive-text))]"
        >
          Cancelar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
