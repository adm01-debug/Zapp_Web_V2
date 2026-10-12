import { Fragment, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent, MutableRefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WorkItemCard } from '../shared/WorkItemCard';
import { grupoInicial, salvarGrupo } from './gruposRecolhidos';
import type { GrupoKey } from './gruposRecolhidos';
import { animacaoDaLinha, transicaoDaLinha } from './animacaoLinha';
import { useListaEstreita } from './responsivo';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TaskCheckbox } from '../shared/TaskCheckbox';
import { ContactAvatar } from '../shared/ContactAvatar';
import { DueCell, PriorityCell, RemindCell, StatusCell } from './taskRowCells';
import { TaskRowMenu } from './taskRowMenu';
import { useTasksUiOptional } from '../shared/tasksUi';
import { daySubtitle, groupUpcomingByDay } from '@/hooks/tasks/workItemAggregates';
import type { BucketsByDue, DayGroup } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem, WorkItemContact, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/**
 * Etapa 049: a ordem CONTRATADA das colunas da Lista. O designer especifica as
 * larguras (etapa 049); a Tarefa fica com a maior fatia porque é a coluna que
 * carrega o texto que trunca.
 */
const COLUNAS = ['Tarefa', 'Contato', 'Prioridade', 'Prazo', 'Lembrete', 'Estado'] as const;
const LARGURAS = ['36%', '17%', '12%', '15%', '11%', '9%'] as const;

/**
 * Bloco circular do ícone do grupo (etapa 051) — um par de TOKENS por grupo, sem
 * cor literal. O aviso usa o token de TEXTO (`--warning-text`), como as pílulas.
 */
const TONS = {
  atrasadas: 'bg-destructive/10 text-destructive',
  hoje: 'bg-warning/15 text-[hsl(var(--warning-text))]',
  prazo: 'bg-primary/10 text-primary',
  neutro: 'bg-muted text-muted-foreground',
  concluidas: 'bg-success/15 text-success',
} as const;

/**
 * Etapas 050/051/053/054 — a Lista do módulo de Tarefas em TABELA.
 *
 * Uma `<table>` de verdade: cabeçalho fixo (`sticky`) com as 6 colunas do
 * contrato (049) e cada grupo como uma LINHA DE SEÇÃO (`<th colSpan>` com o
 * ícone circular, o título e o contador — etapa 051). O grupo "Hoje" leva o
 * subtítulo do dia em pt-BR ("Domingo, 11 de outubro", a regra única do
 * `daySubtitle`), e "Próximas" continua separada por dia (`groupUpcomingByDay`).
 *
 * Só a célula Tarefa (053) e a célula Contato (054) nasceram com este cartão; as
 * quatro colunas da direita — Prioridade, Prazo, Lembrete e Estado (056–060) —
 * são as células de `taskRowCells.tsx`.
 *
 * Semântica e teclado: as linhas são `<tr>`; o que é acionável é `<button>`
 * nativo (checkbox, cabeçalho do grupo, contato), então Enter/Espaço, foco e o
 * anel de foco vêm do navegador. O clique do checkbox e do contato não abre os
 * detalhes (`stopPropagation`), quem abre é o clique na LINHA (etapa 063).
 */
export interface TasksListTableProps {
  byDue: BucketsByDue;
  /** "Agora" injetável — o subtítulo do grupo "Hoje" e o agrupamento por dia. */
  now?: Date;
  onOpen: (item: WorkItem) => void;
  onToggleDone: (item: WorkItem) => void;
  /** Etapa 054: clique no contato abre a conversa no inbox. */
  onOpenContact?: (item: WorkItem) => void;
  /** Etapa 060: o menu da pílula de estado move o item (regras do `MoveTargets`). */
  onMoveTo?: (item: WorkItem, to: WorkItemStatus) => void;
  /** Etapa 060: contagem REAL de "Fazendo" (trava a coluna com 3/3). */
  doingCount?: number;
  /** Etapa 060: "Aguardando" sem motivo abre o detalhe no campo do motivo. */
  onRequestWaitingReason?: (item: WorkItem) => void;
  /** Etapa 059: popover do lembrete (adiar · remover · escolher). */
  onSnooze?: (item: WorkItem, minutes: number | 'tomorrow9') => void;
  onClearReminder?: (item: WorkItem) => void;
  onOpenReminder?: (item: WorkItem) => void;
  /** Etapa 061: "Concluir"/"Reabrir" do menu ⋮ da linha. */
  onComplete?: (item: WorkItem) => void;
  onReopen?: (item: WorkItem) => void;
  /** Etapa 061: "Cancelar" do menu ⋮ (e o Delete do teclado, etapa 064). */
  onDelete?: (item: WorkItem) => void;
  /** A primeira renderização não anima a entrada das linhas (etapa 072). */
  hasMounted: MutableRefObject<boolean>;
}

interface ListSection {
  key: GrupoKey;
  title: string;
  icon: LucideIcon;
  tone: string;
  titleClass?: string;
  items: WorkItem[];
  /** Concluídas de 8 a 30 dias, reveladas pelo "Ver até 30 dias >" do cabeçalho. */
  olderItems?: WorkItem[];
  /** Subcabeçalhos por dia — usados pela seção "Próximas". */
  groups?: DayGroup[];
  hint?: string;
  /** Subtítulo do dia (etapa 051) — hoje só o grupo "Hoje" carrega. */
  subtitle?: string;
}

/** Nome mostrado na célula Contato — a mesma palavra do resto do módulo. */
function nomeDoContato(contact: WorkItemContact): string {
  return contact.name?.trim() || 'Sem nome';
}

/** Cabeçalho de um grupo: ícone circular + título + contador (+ subtítulo/hint). */
function GroupRow({
  section,
  open,
  count,
  onToggle,
  showOlder,
  onVerMais,
}: {
  section: ListSection;
  open: boolean;
  count: number;
  onToggle: () => void;
  /** Etapa 066: o "Ver até 30 dias >" vive no cabeçalho (só o Grupo Concluídas). */
  showOlder?: boolean;
  onVerMais?: () => void;
}) {
  const Icon = section.icon;
  const Chevron = open ? ChevronDown : ChevronRight;
  const temAntigas = (section.olderItems?.length ?? 0) > 0;

  return (
    <tr data-testid="list-group-row" data-group={section.key} className="h-9 border-t border-border/60 bg-muted/30">
      <th scope="colgroup" colSpan={COLUNAS.length} className="px-3 text-left font-normal">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={`flex items-center gap-1.5 text-[13px] font-semibold ${section.titleClass ?? 'text-muted-foreground'} hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded`}
          >
            <Chevron className="h-4 w-4" aria-hidden />
            <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${section.tone}`}>
              <Icon className="h-3 w-3" aria-hidden />
            </span>
            {section.title}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs tabular-nums">{count}</span>
          </button>
          {section.subtitle && (
            <span className="truncate text-xs font-medium text-muted-foreground">{section.subtitle}</span>
          )}
          {section.hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={section.hint}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">{section.hint}</TooltipContent>
            </Tooltip>
          )}
          {/* Etapa 066/067 — o "Ver até 30 dias >" revela as concluídas de 8 a 30
              dias; fica no cabeçalho do grupo, não mais no rodapé da tabela. */}
          {temAntigas && onVerMais && (
            <button
              type="button"
              data-testid="list-group-ver-mais"
              onClick={onVerMais}
              aria-expanded={showOlder === true}
              className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showOlder ? 'Ver menos' : 'Ver até 30 dias'}
              {showOlder ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
            </button>
          )}
        </div>
      </th>
    </tr>
  );
}

/** Teclado da tabela (etapa 064): ↑/↓ andam entre as LINHAS montadas da tabela. */
function focarLinhaVizinha(linha: HTMLTableRowElement, passo: 1 | -1) {
  const linhas = Array.from(
    linha.closest('table')?.querySelectorAll<HTMLTableRowElement>('[data-testid="task-row"]') ?? []
  );
  const i = linhas.indexOf(linha);
  linhas[i + passo]?.focus();
}

/**
 * O que NÃO abre os detalhes pelo clique da linha (etapa 063): qualquer controle
 * (checkbox, contato, kebab) e o conteúdo dos menus/popovers, que é portaled mas
 * sobe pela árvore React até a linha.
 */
const CONTROLES_DO_CLIQUE = 'button, a, input, select, textarea, [role="menuitem"], [role="menu"]';

/** Linha de item: Tarefa (053), Contato (054) e as quatro células (056–060). */
function ItemRow({
  item,
  index,
  now,
  hasMounted,
  onOpen,
  onToggleDone,
  onOpenContact,
  onMoveTo,
  doingCount,
  onRequestWaitingReason,
  onSnooze,
  onClearReminder,
  onOpenReminder,
  onComplete,
  onReopen,
  onDelete,
}: {
  item: WorkItem;
  index: number;
  now?: Date;
  hasMounted: MutableRefObject<boolean>;
  onOpen: (item: WorkItem) => void;
  onToggleDone: (item: WorkItem) => void;
  onOpenContact?: (item: WorkItem) => void;
  onMoveTo?: (item: WorkItem, to: WorkItemStatus) => void;
  doingCount?: number;
  onRequestWaitingReason?: (item: WorkItem) => void;
  onSnooze?: (item: WorkItem, minutes: number | 'tomorrow9') => void;
  onClearReminder?: (item: WorkItem) => void;
  onOpenReminder?: (item: WorkItem) => void;
  onComplete?: (item: WorkItem) => void;
  onReopen?: (item: WorkItem) => void;
  onDelete?: (item: WorkItem) => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  // Etapa 062: a seleção é do MÓDULO, não da tabela — a linha lê o mesmo estado
  // de UI que o painel de detalhes (`TasksUiContext`). Fora do provider (testes
  // do modo) a linha só não se marca; nada quebra.
  const ui = useTasksUiOptional();
  const selecionado = ui?.selectedId === item.id;
  const nome = item.contact ? nomeDoContato(item.contact) : null;
  // Etapa 066: concluída/cancelada sai riscada e em muted — o mesmo par que o
  // card usa (line-through + text-muted-foreground).
  const concluido = item.status === 'done' || item.status === 'cancelled';

  /** Seleciona no módulo e abre os detalhes — clique e teclado pelo MESMO caminho. */
  const abrir = () => {
    ui?.openPanel(item.id);
    onOpen(item);
  };

  const aoClicar = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest(CONTROLES_DO_CLIQUE)) return;
    abrir();
  };

  const aoTeclar = (e: KeyboardEvent<HTMLTableRowElement>) => {
    // Só atalhos da PRÓPRIA linha: teclas de dentro do checkbox/kebab/menu não
    // podem mover o foco nem abrir/concluir a linha.
    if (e.target !== e.currentTarget) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focarLinhaVizinha(e.currentTarget, 1); return;
      case 'ArrowUp': e.preventDefault(); focarLinhaVizinha(e.currentTarget, -1); return;
      case 'Enter': e.preventDefault(); abrir(); return;
      case ' ': e.preventDefault(); onToggleDone(item); return;
      case 'x': case 'X': onToggleDone(item); return;
      // `E` edita: o detalhe é a superfície de edição (o card usava o mesmo `E`).
      case 'e': case 'E': abrir(); return;
      case 'Delete': onDelete?.(item); return;
      default: return;
    }
  };

  return (
    <motion.tr
      data-testid="task-row"
      data-item-id={item.id}
      data-selected={selecionado ? 'true' : 'false'}
      tabIndex={0}
      // Etapa 065/072: a entrada e a saída animam ALTURA (abrir o grupo cresce,
      // concluir encolhe) + opacidade/deslocamento; em movimento reduzido só a
      // opacidade permanece — nenhuma animação de altura (ver `animacaoLinha`).
      initial={hasMounted.current ? false : animacaoDaLinha(reduceMotion).initial}
      animate={animacaoDaLinha(reduceMotion).animate}
      exit={animacaoDaLinha(reduceMotion).exit}
      transition={transicaoDaLinha(reduceMotion, index)}
      onClick={aoClicar}
      onKeyDown={aoTeclar}
      className={[
        'group h-11 cursor-pointer border-t border-border/40 align-middle hover:bg-muted/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selecionado ? 'bg-primary/10' : '',
      ].join(' ')}
    >
      {/* Etapa 053 — célula Tarefa: checkbox circular + título numa linha com
          tooltip; etapa 061 — o menu ⋮ fecha a célula; etapa 062 — a barra de
          3 px da linha selecionada é um elemento próprio (não muda a largura). */}
      <td className="relative h-11 overflow-hidden px-3 align-middle">
        {selecionado && (
          <span
            data-testid="row-selection-bar"
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[3px] bg-primary"
          />
        )}
        <div className="flex min-w-0 items-center gap-2">
          <TaskCheckbox done={item.status === 'done'} onToggle={() => onToggleDone(item)} />
          <div className="min-w-0 flex-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`block truncate text-sm font-medium ${concluido ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{item.title}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[320px] text-xs">{item.title}</TooltipContent>
            </Tooltip>
            {item.status === 'waiting' && item.waiting_reason && (
              <p className="truncate text-2xs text-[hsl(var(--warning-text))]">{item.waiting_reason}</p>
            )}
          </div>
          {/* Etapa 061 — o menu ⋮ da linha, com as ações do card (061). */}
          <TaskRowMenu
            item={item}
            onOpen={onOpen}
            onComplete={onComplete}
            onReopen={onReopen}
            onMoveTo={onMoveTo}
            doingCount={doingCount}
            onRequestWaitingReason={onRequestWaitingReason}
            onSnooze={onSnooze}
            onClearReminder={onClearReminder}
            onOpenReminder={onOpenReminder}
            onDelete={onDelete}
          />
        </div>
      </td>

      {/* Etapa 054 — célula Contato: avatar com iniciais (ou foto) + nome. */}
      <td className="px-3 align-middle">
        {item.contact ? (
          onOpenContact ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenContact(item);
              }}
              className="flex min-w-0 max-w-full items-center gap-2 rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ContactAvatar name={item.contact.name} avatarUrl={item.contact.avatar_url} size="sm" />
              <span className="truncate text-xs text-foreground">{nome}</span>
            </button>
          ) : (
            <span className="flex min-w-0 max-w-full items-center gap-2">
              <ContactAvatar name={item.contact.name} avatarUrl={item.contact.avatar_url} size="sm" />
              <span className="truncate text-xs text-foreground">{nome}</span>
            </span>
          )
        ) : (
          <span className="text-xs text-muted-foreground/70">Sem contato</span>
        )}
      </td>

      {/* Etapas 056–060 — Prioridade, Prazo, Lembrete e Estado. */}
      <td className="px-3 align-middle"><PriorityCell priority={item.priority} /></td>
      <td className="px-3 align-middle"><DueCell dueDate={item.due_date} status={item.status} now={now} /></td>
      <td className="px-3 align-middle">
        <RemindCell
          item={item}
          now={now}
          onSnooze={onSnooze}
          onClearReminder={onClearReminder}
          onOpenReminder={onOpenReminder}
        />
      </td>
      <td className="px-3 align-middle">
        <StatusCell
          item={item}
          doingCount={doingCount}
          onMoveTo={onMoveTo}
          onRequestWaitingReason={onRequestWaitingReason}
        />
      </td>
    </motion.tr>
  );
}

/** Uma seção/grupo da tabela: cabeçalho de grupo e, aberto, as linhas dele. */
function SectionRows({
  section,
  now,
  hasMounted,
  onOpen,
  onToggleDone,
  onOpenContact,
  onMoveTo,
  doingCount,
  onRequestWaitingReason,
  onSnooze,
  onClearReminder,
  onOpenReminder,
  onComplete,
  onReopen,
  onDelete,
}: {
  section: ListSection;
  now?: Date;
  hasMounted: MutableRefObject<boolean>;
  onOpen: (item: WorkItem) => void;
  onToggleDone: (item: WorkItem) => void;
  onOpenContact?: (item: WorkItem) => void;
  onMoveTo?: (item: WorkItem, to: WorkItemStatus) => void;
  doingCount?: number;
  onRequestWaitingReason?: (item: WorkItem) => void;
  onSnooze?: (item: WorkItem, minutes: number | 'tomorrow9') => void;
  onClearReminder?: (item: WorkItem) => void;
  onOpenReminder?: (item: WorkItem) => void;
  onComplete?: (item: WorkItem) => void;
  onReopen?: (item: WorkItem) => void;
  onDelete?: (item: WorkItem) => void;
}) {
  const [open, setOpen] = useState(() => grupoInicial(section.key));
  const [showOlder, setShowOlder] = useState(false);

  const { items, olderItems = [] } = section;
  // A seção existe enquanto houver o que mostrar — inclusive quando só há
  // concluídas de 8 a 30 dias, que ficam atrás do "Ver até 30 dias >".
  if (items.length === 0 && olderItems.length === 0) return null;

  const visible = showOlder ? [...items, ...olderItems] : items;
  const groups = section.groups && section.groups.length > 0 ? section.groups : null;

  /** Etapa 065: alterna o grupo e guarda a escolha do usuário no navegador. */
  const alternar = () => {
    const novo = !open;
    setOpen(novo);
    salvarGrupo(section.key, novo);
  };

  /** Etapa 066/067: o "Ver até 30 dias >" do cabeçalho — abre o grupo se ele
   *  estiver recolhido e revela/esconde as concluídas de 8 a 30 dias. */
  const alternarAntigas = () => {
    if (!open) {
      setOpen(true);
      salvarGrupo(section.key, true);
    }
    setShowOlder((s) => !s);
  };

  const renderRow = (item: WorkItem, index: number) => (
    <ItemRow
      key={item.id}
      item={item}
      index={index}
      now={now}
      hasMounted={hasMounted}
      onOpen={onOpen}
      onToggleDone={onToggleDone}
      onOpenContact={onOpenContact}
      onMoveTo={onMoveTo}
      doingCount={doingCount}
      onRequestWaitingReason={onRequestWaitingReason}
      onSnooze={onSnooze}
      onClearReminder={onClearReminder}
      onOpenReminder={onOpenReminder}
      onComplete={onComplete}
      onReopen={onReopen}
      onDelete={onDelete}
    />
  );

  return (
    <Fragment>
      <GroupRow
        section={section}
        open={open}
        count={visible.length}
        onToggle={alternar}
        showOlder={showOlder}
        onVerMais={olderItems.length > 0 ? alternarAntigas : undefined}
      />

      {open && groups && groups.map((g) => (
        <Fragment key={`dia-${g.label}`}>
          <tr data-testid="list-day-row" className="h-8 bg-muted/20">
            <th scope="colgroup" colSpan={COLUNAS.length} className="px-3 text-left text-xs font-medium text-muted-foreground">
              {g.label}
            </th>
          </tr>
          <AnimatePresence initial={false}>
            {g.items.map((item, index) => renderRow(item, index))}
          </AnimatePresence>
        </Fragment>
      ))}

      {open && !groups && (
        <AnimatePresence initial={false}>
          {visible.map((item, index) => renderRow(item, index))}
        </AnimatePresence>
      )}
    </Fragment>
  );
}

/** As seções da Lista na ordem do contrato (049) — o mesmo recorte nos dois layouts. */
function montarSecoes(byDue: BucketsByDue, ancora: Date): ListSection[] {
  return [
    {
      key: 'atrasadas',
      title: 'Atrasadas',
      icon: AlertTriangle,
      tone: TONS.atrasadas,
      titleClass: 'text-destructive',
      items: byDue.overdue,
    },
    {
      key: 'hoje',
      title: 'Hoje',
      icon: Clock,
      tone: TONS.hoje,
      titleClass: 'text-warning',
      items: byDue.today,
      subtitle: daySubtitle(ancora),
    },
    {
      key: 'amanha',
      title: 'Amanhã',
      icon: Calendar,
      tone: TONS.prazo,
      items: byDue.tomorrow,
    },
    {
      key: 'proximas',
      title: 'Próximas',
      icon: Calendar,
      tone: TONS.prazo,
      items: byDue.upcoming,
      groups: groupUpcomingByDay(byDue.upcoming, ancora),
      hint: 'Ordenado por prazo, depois prioridade',
    },
    {
      key: 'sem-prazo',
      title: 'Sem prazo',
      icon: Circle,
      tone: TONS.neutro,
      items: byDue.noDue,
    },
    {
      // Etapa 066: o grupo é "Concluídas · últimos 7 dias" e o "Ver até 30 dias >"
      // (etapa 067) vive no cabeçalho, revelando `doneOlder`.
      key: 'concluidas',
      title: 'Concluídas · últimos 7 dias',
      icon: CheckCircle2,
      tone: TONS.concluidas,
      titleClass: 'text-muted-foreground',
      items: byDue.done7d,
      olderItems: byDue.doneOlder,
    },
  ];
}

/** As ações que a tela entrega aos itens — as mesmas nos dois layouts (070). */
type AcoesDaLista = Omit<TasksListTableProps, 'byDue' | 'now' | 'hasMounted'>;

/**
 * Etapa 070 — abaixo de 1024 px a Lista vira uma coluna de cartões compactos
 * (`WorkItemCard` no modo lista), sem rolagem horizontal em 360 px. Os grupos e
 * o estado aberto/recolhido são os MESMOS da tabela (etapas 065/067), pelo
 * `gruposRecolhidos`, e o "Ver até 30 dias >" segue no cabeçalho do grupo.
 */
function CartoesDoGrupo({ section, now, ...acoes }: { section: ListSection; now?: Date } & AcoesDaLista) {
  const [open, setOpen] = useState(() => grupoInicial(section.key));
  const [showOlder, setShowOlder] = useState(false);

  const { items, olderItems = [] } = section;
  if (items.length === 0 && olderItems.length === 0) return null;

  const visible = showOlder ? [...items, ...olderItems] : items;
  const Icon = section.icon;
  const Chevron = open ? ChevronDown : ChevronRight;

  const alternar = () => {
    const novo = !open;
    setOpen(novo);
    salvarGrupo(section.key, novo);
  };

  const alternarAntigas = () => {
    if (!open) {
      setOpen(true);
      salvarGrupo(section.key, true);
    }
    setShowOlder((s) => !s);
  };

  return (
    <section data-testid="list-card-group" data-group={section.key} className="min-w-0">
      <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/30 px-2 py-1">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={open}
          className={`flex min-w-0 items-center gap-1.5 text-[13px] font-semibold ${section.titleClass ?? 'text-muted-foreground'} hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded`}
        >
          <Chevron className="h-4 w-4 shrink-0" aria-hidden />
          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${section.tone}`}>
            <Icon className="h-3 w-3" aria-hidden />
          </span>
          <span className="truncate">{section.title}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs tabular-nums">{visible.length}</span>
        </button>
        {section.subtitle && (
          <span className="truncate text-xs font-medium text-muted-foreground">{section.subtitle}</span>
        )}
        {olderItems.length > 0 && (
          <button
            type="button"
            data-testid="list-group-ver-mais"
            onClick={alternarAntigas}
            aria-expanded={showOlder}
            className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showOlder ? 'Ver menos' : 'Ver até 30 dias'}
            {showOlder ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {visible.map((item) => (
            <WorkItemCard
              key={item.id}
              item={item}
              mode="list"
              contactName={item.contact?.name ?? null}
              onOpen={() => acoes.onOpen(item)}
              onToggleDone={() => acoes.onToggleDone(item)}
              onOpenContact={acoes.onOpenContact ? () => acoes.onOpenContact?.(item) : undefined}
              onMoveTo={acoes.onMoveTo ? (to) => acoes.onMoveTo?.(item, to) : undefined}
              doingCount={acoes.doingCount}
              onRequestWaitingReason={acoes.onRequestWaitingReason ? () => acoes.onRequestWaitingReason?.(item) : undefined}
              onSnooze={acoes.onSnooze ? (minutos) => acoes.onSnooze?.(item, minutos) : undefined}
              onClearReminder={acoes.onClearReminder ? () => acoes.onClearReminder?.(item) : undefined}
              onOpenReminder={acoes.onOpenReminder ? () => acoes.onOpenReminder?.(item) : undefined}
              onComplete={acoes.onComplete ? () => acoes.onComplete?.(item) : undefined}
              onReopen={acoes.onReopen ? () => acoes.onReopen?.(item) : undefined}
              onDelete={acoes.onDelete ? () => acoes.onDelete?.(item) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function TasksListTable({
  byDue,
  now,
  onOpen,
  onToggleDone,
  onOpenContact,
  onMoveTo,
  doingCount,
  onRequestWaitingReason,
  onSnooze,
  onClearReminder,
  onOpenReminder,
  onComplete,
  onReopen,
  onDelete,
  hasMounted,
}: TasksListTableProps) {
  const ancora = useMemo(() => now ?? new Date(), [now]);
  const secoes = useMemo(() => montarSecoes(byDue, ancora), [byDue, ancora]);
  const estreita = useListaEstreita();

  const acoes: AcoesDaLista = {
    onOpen, onToggleDone, onOpenContact, onMoveTo, doingCount,
    onRequestWaitingReason, onSnooze, onClearReminder, onOpenReminder,
    onComplete, onReopen, onDelete,
  };

  // Etapa 070 — abaixo de 1024 px: cartões compactos, uma coluna, sem rolagem.
  if (estreita) {
    return (
      <div className="w-full min-w-0 space-y-3 pb-8" data-testid="tasks-list-cards">
        {secoes.map((secao) => (
          <CartoesDoGrupo key={secao.key} section={secao} now={now} {...acoes} />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 pb-8" data-testid="tasks-list-table">
      <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Tarefas agrupadas por prazo</caption>
        <colgroup>
          {LARGURAS.map((largura, i) => (
            <col key={COLUNAS[i]} style={{ width: largura }} />
          ))}
        </colgroup>
        <thead>
          <tr className="h-9">
            {COLUNAS.map((coluna) => (
              <th
                key={coluna}
                scope="col"
                className="sticky top-0 z-10 h-9 border-b border-border/60 bg-background px-3 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {secoes.map((secao) => (
            <SectionRows
              key={secao.key}
              section={secao}
              now={now}
              hasMounted={hasMounted}
              onOpen={onOpen}
              onToggleDone={onToggleDone}
              onOpenContact={onOpenContact}
              onMoveTo={onMoveTo}
              doingCount={doingCount}
              onRequestWaitingReason={onRequestWaitingReason}
              onSnooze={onSnooze}
              onClearReminder={onClearReminder}
              onOpenReminder={onOpenReminder}
              onComplete={onComplete}
              onReopen={onReopen}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
