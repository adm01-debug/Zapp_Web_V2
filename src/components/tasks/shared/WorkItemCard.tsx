import React from 'react';
import { MoreVertical, MessageSquare, AlertCircle } from 'lucide-react';
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
import { agingDays } from '@/hooks/tasks/workItemMachine';
import { isOverdue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { TaskCheckbox }   from './TaskCheckbox';
import { useTasksUiOptional } from './tasksUi';
import { PriorityPill }   from './PriorityPill';
import { DateLabel }      from './DateLabel';
import { RemindChip }     from './RemindChip';
import { ContactChip }    from './ContactChip';
import { AgingDot }       from './AgingDot';
import { MoveToMenu, MoveTargets } from '../board/MoveToMenu';
import { aceitaLembrete, MOTIVO_SEM_LEMBRETE } from './cardActions';

interface Props {
  item: WorkItem;
  mode: 'list' | 'board' | 'agenda';
  contactName?: string | null;
  onOpen?: () => void;
  onToggleDone?: () => void;
  /** Kebab → "Concluir" (etapa 30). */
  onComplete?: () => void;
  /** Kebab → "Reabrir", quando o item já está concluído/cancelado. */
  onReopen?: () => void;
  onMoveTo?: (status: WorkItemStatus) => void;
  /** Kebab/MoveToMenu → "Aguardando" sem motivo: abre o Sheet (etapa 29). */
  onRequestWaitingReason?: () => void;
  /** Kebab → "Lembrar-me": adiar 15 min · 1 h · Amanhã 9h (etapa 30). */
  onSnooze?: (minutes: number | 'tomorrow9') => void;
  /** Kebab → "Lembrar-me → Remover alarme" e popover do RemindChip. */
  onClearReminder?: () => void;
  /** Kebab → "Lembrar-me → Escolher…" e popover do RemindChip. */
  onOpenReminder?: () => void;
  onDelete?: () => void;
  onOpenContact?: () => void;
  /** Contagem real de "Fazendo" — trava a opção cheia (etapa 29). */
  doingCount?: number;
  isDragging?: boolean;
  /**
   * Etapa 090: o card é o MESMO item aberto no painel de detalhes. Quem abre o
   * painel (Quadro/módulo) passa `isSelected`; sem a prop, o card cai no
   * `selectedId` do `TasksUiProvider` (`useTasksUiOptional`) — assim a seleção
   * do painel sincroniza o card sem o chamador repetir o estado.
   */
  isSelected?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}

export const WorkItemCard = React.memo(function WorkItemCard({
  item, mode, contactName, onOpen, onToggleDone, onComplete, onReopen, onMoveTo,
  onRequestWaitingReason, onSnooze, onClearReminder, onOpenReminder, onDelete,
  onOpenContact, doingCount = 0, isDragging, isSelected, dragHandleProps,
}: Props) {
  // Etapa 090: seleção explícita (prop) ou vinda do painel de detalhes
  // (`selectedId` do provider); fora do provider o hook opcional devolve null.
  const ui = useTasksUiOptional();
  const selecionado = isSelected ?? ui?.selectedId === item.id;
  const aging = ['doing','waiting'].includes(item.status) ? agingDays(item) : 0;
  const isDone = item.status === 'done' || item.status === 'cancelled';
  // #425 / R2-MOD-057: o executor do alarme ignora done/cancelled — nesses
  // estados o card não oferece lembrete (aqui o chip e o "Lembrar-me" do kebab).
  const lembreteElegivel = aceitaLembrete(item.status);
  // Etapa 56: na Agenda o card é uma linha só, de 44px (h-11).
  const isAgenda = mode === 'agenda';
  // Etapa 32: o contato vem do item quando o chamador não o monta.
  const nomeContato = contactName ?? item.contact?.name ?? null;
  // Etapa 085: "Urgente" vai em destaque junto ao título; as demais prioridades
  // seguem na linha de contexto, abaixo.
  const urgente = item.priority === 'urgent';
  // Etapa 086: a tag "Atrasada" acompanha o prazo vencido (regra única de
  // atraso — `isOverdue`, a mesma do badge e do `bucketByDue`).
  const atrasada = !!item.due_date && !isDone && isOverdue(item.due_date);
  // Etapas 087/088: no card em "Fazendo" (ou no card selecionado, etapa 090) o
  // prazo e o lembrete ganham rótulos em duas colunas e a descrição curta aparece.
  const detalhado = !isAgenda && (item.status === 'doing' || selecionado);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Só atalhos do PRÓPRIO card: teclas disparadas por filhos (checkbox, kebab)
    // não podem abrir/concluir o card — o Enter no kebab, por exemplo, abriria o
    // Sheet junto com o menu.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') onOpen?.();
    if (e.key === 'x' || e.key === 'X') onToggleDone?.();
    if (e.key === 'Delete') onDelete?.();
  };

  // Peças montadas uma vez e usadas nos dois layouts (nada de copiar JSX).
  // Etapa 084 (D16): checkbox CIRCULAR em todas as superfícies, pela mesma peça
  // (`TaskCheckbox`) da Lista, do Quadro, da Agenda, do painel e do modal.
  const checkbox = (
    <TaskCheckbox
      done={isDone}
      onToggle={onToggleDone}
      className={isAgenda ? 'shrink-0' : 'mt-0.5'}
    />
  );

  // Etapas 084/085: título em até 2 linhas (a Agenda segue em linha única).
  const titulo = (
    <span className={`flex-1 min-w-0 text-sm font-semibold leading-snug ${isAgenda ? 'truncate' : 'line-clamp-2'} ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
      {item.title}
    </span>
  );

  // Etapas 086/087: prazo pela regra única de datas (`DateLabel` → workItemFormat)
  // com a tag "Atrasada" ao lado quando vencido.
  const prazo = item.due_date && !isDone ? (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <DateLabel value={item.due_date} overdue={atrasada} />
      {atrasada && (
        <span
          data-testid="overdue-tag"
          className="inline-flex items-center gap-0.5 text-2xs font-semibold text-[hsl(var(--destructive-text))]"
        >
          <AlertCircle className="h-3 w-3" aria-hidden />
          Atrasada
        </span>
      )}
    </span>
  ) : null;

  const lembrete = item.remind_at && lembreteElegivel ? (
    <RemindChip
      remindAt={item.remind_at}
      notifiedAt={item.notified_at}
      onSnooze={onSnooze}
      onClearReminder={onClearReminder}
      onOpenReminder={onOpenReminder}
    />
  ) : null;

  // Etapa 089: em Aguardando, chip com ponto âmbar e o motivo curto, truncado
  // com tooltip (a Agenda não mostra — etapa 56).
  const espera = item.status === 'waiting' && item.waiting_reason ? (
    <span
      data-testid="waiting-chip"
      title={item.waiting_reason}
      className="inline-flex items-center gap-1.5 min-w-0 max-w-full rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-2xs font-medium text-[hsl(var(--warning-text))]"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
      <span className="truncate">{item.waiting_reason}</span>
    </span>
  ) : null;

  const contexto = (
    <>
      {nomeContato && (
        <ContactChip
          contactName={nomeContato}
          avatarUrl={item.contact?.avatar_url}
          onClick={onOpenContact}
        />
      )}
      {/* Etapa 085: a prioridade padrão (não urgente) fica na linha de contexto. */}
      {!urgente && <PriorityPill priority={item.priority} />}
      {/* Com os rótulos em duas colunas (087), o prazo e o lembrete saem daqui. */}
      {!detalhado && prazo}
      {!detalhado && lembrete}
      {aging > 0 && <AgingDot days={aging} />}
    </>
  );

  // Etapa 30: kebab com os 5 grupos — Abrir · Concluir/Reabrir · Lembrar-me ▸ ·
  // Mover para ▸ · Cancelar (D8: "Remover" virou "Cancelar", com undo).
  const kebab = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`${isAgenda ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'} h-6 w-6 shrink-0 rounded-md hover:bg-muted transition-opacity flex items-center justify-center`}
          aria-label="Mais opções"
        >
          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen?.(); }}>Abrir</DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); if (isDone) onReopen?.(); else onComplete?.(); }}>
          {isDone ? 'Reabrir' : 'Concluir'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          {/* #425 / R2-MOD-057: em estado terminal o adiamento não dispara (o
              executor ignora done/cancelled) — a opção fica desabilitada com o
              motivo, em vez de anunciar "Aviso adiado" para um alarme morto. */}
          <DropdownMenuSubTrigger
            disabled={!lembreteElegivel}
            aria-disabled={lembreteElegivel ? undefined : 'true'}
            aria-label={lembreteElegivel ? undefined : `Lembrar-me — ${MOTIVO_SEM_LEMBRETE}`}
            title={lembreteElegivel ? undefined : MOTIVO_SEM_LEMBRETE}
            className={lembreteElegivel ? undefined : 'pointer-events-none opacity-50'}
          >
            Lembrar-me
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSnooze?.(15); }}>15 min</DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSnooze?.(60); }}>1 h</DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSnooze?.('tomorrow9'); }}>Amanhã 9h</DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenReminder?.(); }}>Escolher…</DropdownMenuItem>
            {item.remind_at && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClearReminder?.(); }}>Remover alarme</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Mover para</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <MoveTargets
              item={item}
              doingCount={doingCount}
              onMoveTo={onMoveTo}
              onRequestWaitingReason={onRequestWaitingReason}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          className="text-[hsl(var(--destructive-text))] focus:text-[hsl(var(--destructive-text))]"
        >
          Cancelar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Etapa 78: no Quadro o card é a alça de arrasto — o leitor de tela anuncia
  // "tarefa arrastável" em vez do "button" cru da lib de DnD.
  const roleDescription = mode === 'board' ? { 'aria-roledescription': 'tarefa arrastável' } : {};

  // N-180: o spread do dragHandleProps vem ANTES do role="article". A lib de
  // DnD manda role="button" no card (que já contém checkbox, kebab e "Abrir
  // conversa"), o que criava botão-dentro-de-botão: o leitor de tela anunciava
  // widget e o axe acusava nested-interactive + aria-allowed-role, já que
  // role="button" não é permitido no elemento <article>. Com o role="article"
  // por cima, o card segue article e a alça continua focável pelo tabIndex.
  return (
    <article
      data-testid="work-item-card"
      data-mode={mode}
      data-item-id={item.id}
      {...(selecionado ? { 'data-selected': 'true' } : {})}
      {...(mode === 'board' && dragHandleProps ? dragHandleProps : {})}
      role="article"
      tabIndex={0}
      aria-label={[item.title, item.status, item.due_date ? 'prazo ' + item.due_date : ''].filter(Boolean).join(', ')}
      onKeyDown={handleKeyDown}
      onClick={onOpen}
      className={[
        'group relative border cursor-pointer',
        isAgenda
          ? 'flex flex-row h-11 items-center gap-2 rounded-xl px-3'
          : 'flex flex-col gap-1.5 rounded-[14px] p-3 min-h-[72px]',
        // Etapa 090: card selecionado = borda primary + fundo primary/10.
        selecionado ? 'bg-primary/10' : 'bg-card',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'transition-[border-color,box-shadow,transform] duration-150',
        selecionado
          ? 'border-primary'
          : isDragging
            ? 'border-primary/60 shadow-[0_8px_24px_-8px_hsl(var(--primary)/.45)] rotate-[1deg] scale-[1.02]'
            : isDone
              ? 'border-border/40 opacity-60'
              : 'border-border/70 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/.25)]',
      ].join(' ')}
      {...roleDescription}
    >
      {isAgenda ? (
        /* Linha única (etapa 56): checkbox · título · chips à direita · kebab */
        <>
          {checkbox}
          {titulo}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 min-w-0 overflow-hidden">
            <PriorityPill priority={item.priority} compact />
            {contexto}
          </div>
          {kebab}
        </>
      ) : (
        <>
          {/* Header: checkbox · título (2 linhas) · Urgente · alça ⠿ · mover · kebab */}
          <div className="flex items-start gap-2 min-w-0">
            {checkbox}
            {titulo}
            {/* Etapa 085: Urgente em destaque junto ao título. */}
            {urgente && <PriorityPill priority="urgent" className="mt-0.5" />}
            {/* Etapa 090: alça de arrastar ⠿ (o arrasto real é o próprio card). */}
            {mode === 'board' && (
              <span aria-hidden className="mt-0.5 shrink-0 select-none text-xs leading-none text-muted-foreground/60">⠿</span>
            )}
            {/* Etapa 33/82: só existe sob ponteiro grosso; em desktop some. */}
            <MoveToMenu
              item={item}
              doingCount={doingCount}
              onMoveTo={onMoveTo}
              onRequestWaitingReason={onRequestWaitingReason}
            />
            {kebab}
          </div>

          {/* Chips de contexto (contato, prioridade, prazo, lembrete, dias) */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            {contexto}
          </div>

          {/* Etapas 087/088: no card em Fazendo/selecionado, Prazo e Lembrete em
              duas colunas rotuladas, com a descrição curta abaixo. */}
          {detalhado && (
            <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-2 mt-0.5 min-w-0">
              <div className="min-w-0">
                <span className="block text-2xs uppercase tracking-wide text-muted-foreground">Prazo</span>
                {prazo ?? <span className="text-xs text-muted-foreground">Sem prazo</span>}
              </div>
              <div className="min-w-0">
                <span className="block text-2xs uppercase tracking-wide text-muted-foreground">Lembrete</span>
                {lembrete ?? <span className="text-xs text-muted-foreground">Sem lembrete</span>}
              </div>
            </div>
          )}
          {detalhado && item.description && (
            <p className="text-2xs text-muted-foreground line-clamp-2 min-w-0">{item.description}</p>
          )}

          {/* Etapa 089: motivo de espera como chip (a Agenda não mostra — etapa 56) */}
          {espera}

          {/* Acoes rapidas (modo board, mobile) */}
          {mode === 'board' && onOpenContact && nomeContato && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenContact(); }}
              // E16: nasce com `opacity-0` (sem `focus-visible:opacity-100` o Tab parava
              // num controle invisível — o anel de foco do `button:focus-visible` some
              // junto com o `opacity-0`, que apaga também a sombra).
              // E18: área mínima de toque de 44 px em mobile (WCAG 2.5.5).
              // N-180.5: escondido ele não intercepta clique sobre o conteúdo
              // (pointer-events-none); o mouse volta no hover e no foco.
              // N-180.6: em aparelho sem hover (toque) "hover" nunca dispara, então
              // opacity-0 + pointer-events-none deixavam o botão inalcançável. A
              // variante [@media(hover:none)] o deixa sempre visível e clicável ali,
              // sem mudar nada em quem usa mouse (a media query não casa lá).
              className="absolute bottom-2 right-2 flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-md bg-muted/80 hover:bg-primary/20 opacity-0 pointer-events-none [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto group-hover:pointer-events-auto focus-visible:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              title="Abrir conversa"
              aria-label="Abrir conversa"
            >
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </>
      )}
    </article>
  );
});
