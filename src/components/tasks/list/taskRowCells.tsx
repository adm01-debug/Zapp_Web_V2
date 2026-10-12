import { useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DateLabel } from '../shared/DateLabel';
import { StatusPill } from '../shared/StatusPill';
import { MoveTargets } from '../board/MoveToMenu';
import { aceitaLembrete, MOTIVO_SEM_LEMBRETE } from '../shared/cardActions';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';
import { formatWorkItemDate } from '@/hooks/tasks/workItemFormat';
import { isOverdue } from '@/hooks/tasks/workItemAggregates';
import { prazoCompleto } from './prazoCompleto';
import type { Priority, WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/**
 * Etapas 056/057/059/060 — as quatro células da direita da Lista em tabela.
 *
 * Cada célula só LÊ o item e chama de volta a ação que o `TasksListMode` já
 * recebe do `TasksModule`; nenhuma delas abre o item (o clique da linha é quem
 * abre, etapa 063), por isso todo gatilho acionável faz `stopPropagation`.
 *
 * O que não é célula daqui vem dos primitivos de `tasks/shared/`: a pílula de
 * estado (`StatusPill`), o rótulo de data (`DateLabel`) e as regras de mover
 * (`MoveTargets`) e de alarme (`aceitaLembrete`) não são reimplementados.
 */

/**
 * Etapa 056 — o par de cor da TABELA. O plano (seção 3) pede a prioridade com a
 * cor dela: Urgente vermelho CHEIO, Alta vermelho em CONTORNO, Média âmbar e
 * Baixa azul. Como o `PriorityPill` de `shared/` é o par de outra tela (Média
 * azul), a variante da tabela mora aqui — sem tocar no primitivo.
 */
const PRIORIDADE_TABELA: Record<Priority, string> = {
  low:    'bg-primary/10 text-primary border-primary/30',
  medium: 'bg-warning/15 text-[hsl(var(--warning-text))] border-warning/40',
  high:   'bg-transparent text-[hsl(var(--destructive-text))] border-destructive',
  urgent: 'bg-destructive text-destructive-foreground border-destructive',
};

/** Prioridade nula ou fora do mapa cai no padrão do banco (`medium`), como nas pílulas. */
export function PriorityCell({ priority }: { priority: Priority | null | undefined }) {
  const p: Priority = priority != null && PRIORITY_LABELS[priority] ? priority : 'medium';
  return (
    <span
      data-testid="priority-cell"
      data-priority={p}
      title={`Prioridade: ${PRIORITY_LABELS[p]}`}
      className={`inline-flex max-w-full items-center overflow-hidden whitespace-nowrap rounded-full border px-1.5 py-0.5 text-2xs font-semibold leading-none ${PRIORIDADE_TABELA[p]}`}
    >
      {PRIORITY_LABELS[p]}
    </span>
  );
}

interface DueCellProps {
  dueDate: string | null;
  /** As concluídas (e canceladas) mostram só o dia e nunca em vermelho. */
  status: WorkItemStatus;
  now?: Date;
}

/** Etapa 057 — calendário + "Hoje, 14:00", com tooltip da data completa. */
export function DueCell({ dueDate, status, now }: DueCellProps) {
  const concluida = status === 'done' || status === 'cancelled';
  const completo = prazoCompleto(dueDate, now);

  const rotulo = (
    <DateLabel
      value={dueDate}
      format={concluida ? 'day' : 'datetime'}
      now={now}
      overdue={!concluida && isOverdue(dueDate, now)}
      // Coluna estreita (table-fixed): uma linha só, sem quebrar a altura da
      // linha de 44 px; o valor completo continua no tooltip.
      className="min-w-0 max-w-full overflow-hidden whitespace-nowrap"
    />
  );

  if (completo === null) return rotulo;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-testid="due-cell" className="inline-flex min-w-0 max-w-full">{rotulo}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{completo}</TooltipContent>
    </Tooltip>
  );
}

/** Etapa 31: os mesmos três adiamentos que o card oferece (15 min · 1 hora · Amanhã 9h). */
const OPCOES_ADIAR: Array<{ label: string; minutes: number | 'tomorrow9' }> = [
  { label: '15 min', minutes: 15 },
  { label: '1 hora', minutes: 60 },
  { label: 'Amanhã 9h', minutes: 'tomorrow9' },
];

interface RemindCellProps {
  item: WorkItem;
  now?: Date;
  onSnooze?: (item: WorkItem, minutes: number | 'tomorrow9') => void;
  onClearReminder?: (item: WorkItem) => void;
  onOpenReminder?: (item: WorkItem) => void;
}

/**
 * Etapa 059 — sino + "Hoje, 13:30"; sem alarme, "Sem lembrete" em muted (não é
 * botão). Com alarme, o clique abre o popover de adiar/remover sem abrir a
 * linha. Em estado terminal o executor do alarme não pega a tarefa
 * (`aceitaLembrete`), então o popover explica o motivo em vez de oferecer um
 * adiamento que não dispara.
 */
export function RemindCell({ item, now, onSnooze, onClearReminder, onOpenReminder }: RemindCellProps) {
  const [open, setOpen] = useState(false);

  if (!item.remind_at) {
    return (
      <span
        data-testid="remind-cell"
        data-empty="true"
        className="inline-flex max-w-full items-center gap-1 overflow-hidden whitespace-nowrap text-xs font-medium text-muted-foreground"
      >
        <Bell className="h-3 w-3" aria-hidden />
        Sem lembrete
      </span>
    );
  }

  const texto = formatWorkItemDate(item.remind_at, { now, format: 'datetime' }) ?? '';
  const vencido = !item.notified_at && new Date(item.remind_at) <= (now ?? new Date());
  const Icon = vencido ? BellRing : Bell;
  const podeAdiar = aceitaLembrete(item.status);

  const acao = (fn?: () => void) => {
    fn?.();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="remind-cell"
          title={`Lembrete: ${texto}`}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex h-10 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${vencido ? 'text-[hsl(var(--destructive-text))]' : 'text-muted-foreground'}`}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {texto}
        </button>
      </PopoverTrigger>
      {/* O conteúdo é portaled no DOM, mas o clique sobe pela ÁRVORE REACT até a
          linha — sem isto, adiar abriria os detalhes do item. */}
      <PopoverContent align="start" className="w-52 p-1" onClick={(e) => e.stopPropagation()}>
        {podeAdiar ? (
          OPCOES_ADIAR.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => acao(() => onSnooze?.(item, o.minutes))}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              {o.label}
            </button>
          ))
        ) : (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{MOTIVO_SEM_LEMBRETE}</p>
        )}
        <button
          type="button"
          onClick={() => acao(() => onClearReminder?.(item))}
          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
        >
          Remover
        </button>
        {onOpenReminder && (
          <button
            type="button"
            onClick={() => acao(() => onOpenReminder(item))}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            Escolher…
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface StatusCellProps {
  item: WorkItem;
  /** Contagem REAL de "Fazendo": com 3/3 o menu trava a coluna (etapa 29/33). */
  doingCount?: number;
  onMoveTo?: (item: WorkItem, to: WorkItemStatus) => void;
  onRequestWaitingReason?: (item: WorkItem) => void;
}

/**
 * Etapa 060 — a pílula de estado é o gatilho do menu de mover. As regras (coluna
 * atual travada, "Fazendo" com 3/3 e o portão do motivo do "Aguardando") são as
 * mesmas do card: vêm do `MoveTargets`, não de uma cópia.
 */
export function StatusCell({ item, doingCount, onMoveTo, onRequestWaitingReason }: StatusCellProps) {
  const semMenu = !onMoveTo && !onRequestWaitingReason;
  if (semMenu) return <StatusPill status={item.status} />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="status-cell"
          title="Mover para outra coluna"
          aria-label="Mover para outra coluna"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-10 max-w-full items-center overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatusPill status={item.status} />
        </button>
      </DropdownMenuTrigger>
      {/* Mesmo caso do popover: o clique sobe pela árvore React até a linha. */}
      <DropdownMenuContent align="start" className="w-44" onClick={(e) => e.stopPropagation()}>
        <MoveTargets
          item={item}
          doingCount={doingCount}
          onMoveTo={(to) => onMoveTo?.(item, to)}
          onRequestWaitingReason={() => onRequestWaitingReason?.(item)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
