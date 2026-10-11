/**
 * Regras dos chips da Inbox — as MESMAS que a lista usa.
 *
 * O contador do chip e a lista precisam concordar. Antes, StatusChips.tsx contava
 * "Resolvidas" por `messages.length === 0` e "Aguardando" por "sem responsável",
 * enquanto a lista usa o estado persistido `contacts.conversation_status`: o número
 * do chip divergia do que a lista mostrava ao clicar.
 *
 * Aqui ficam os predicados puros. `useInboxFilters.ts` usa estes mesmos predicados
 * na filtragem e `countByChip` monta os totais com eles, então lista e contador não
 * têm mais como divergir.
 */
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { ChipTab } from '@/components/inbox/TicketTabs';
import type { InboxFiltersState } from '@/components/inbox/InboxFilters';
import { FILTER_OPTIONS } from '@/components/inbox/ContactTypeFilter';
import { isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

/** Filtros que a lista aplica por cima do chip (busca, tipo de contato e painel Filtros). */
export interface ExtraFilterContext {
  /** Busca por nome/telefone/e-mail — mesma regra da lista. */
  search?: string | null;
  /** Tipo de contato selecionado no ContactTypeFilter. */
  selectedContactType?: string | null;
  /** Painel Filtros: status, etiquetas, atendente e intervalo de datas. */
  filters?: InboxFiltersState | null;
}

export interface ChipCountOpts extends ExtraFilterContext {
  /** Adiamentos vigentes (R2-INB-029): a lista e o contador os excluem igual. */
  snoozedIds?: Set<string> | null;
  /** "Mostrar todos" da lista: Em atendimento passa a acompanhar Todas. */
  showAll?: boolean;
  /** Fila selecionada; a lista aplica por cima dos chips abertos e de Arquivadas. */
  selectedQueueId?: string | null;
}

export type ChipCounts = Record<ChipTab, number>;

/** Linha válida: a lista descarta conversa sem contato. */
export const hasContact = (c: ConversationWithMessages): boolean =>
  Boolean(c && c.contact && c.contact.id);

/** Adiadas saem da listagem enquanto o prazo vigora (R2-INB-029). */
export const isSnoozed = (c: ConversationWithMessages, snoozedIds?: Set<string> | null): boolean =>
  Boolean(snoozedIds && snoozedIds.size > 0 && snoozedIds.has(c.contact.id));

/** "Não lidas": contador da conversa ou o agregado persistido no contato. */
export const isUnread = (c: ConversationWithMessages): boolean => {
  const unreadMessages = (c.contact as unknown as { unread_messages?: number }).unread_messages ?? 0;
  return (c.unreadCount ?? 0) > 0 || unreadMessages > 0;
};

/**
 * Ativas = open|waiting COM mensagem carregada (ADR-005, passo 3). O
 * `messages.length > 0` não decide o estado: é o guarda de atividade que mantém
 * fora da inbox o contato histórico que nunca conversou.
 */
export const isOpenActive = (c: ConversationWithMessages): boolean =>
  (c.contact.conversation_status === 'open' || c.contact.conversation_status === 'waiting') &&
  c.messages.length > 0;

/** Em atendimento = responsável é o perfil do usuário. */
export const isAttending = (c: ConversationWithMessages, profileId: string | undefined): boolean =>
  profileId != null && c.contact.assigned_to === profileId;

/** Aguardando = estado persistido 'waiting' (não mais "sem responsável"). */
export const isWaiting = (c: ConversationWithMessages): boolean =>
  c.contact.conversation_status === 'waiting';

/** Resolvidas = estado persistido 'resolved' (não mais "sem mensagens"). */
export const isResolved = (c: ConversationWithMessages): boolean =>
  c.contact.conversation_status === 'resolved';

/** Arquivadas = estado persistido 'archived'. */
export const isArchived = (c: ConversationWithMessages): boolean =>
  c.contact.conversation_status === 'archived';

/** Fila selecionada. */
export const isInQueue = (c: ConversationWithMessages, queueId: string): boolean =>
  c.contact.queue_id === queueId;

const CHIPS: ChipTab[] = ['all', 'unread', 'attending', 'waiting', 'resolved', 'archived'];

/**
 * Filtros que a lista aplica por cima do chip, na MESMA ordem e com as MESMAS
 * bordas: busca (nome/telefone/e-mail), painel Filtros (status, etiquetas,
 * atendente, intervalo de datas) e tipo de contato. `useInboxFilters.ts` chama
 * esta função na sua filtragem, então lista e contador compartilham o código.
 *
 * O intervalo de datas só filtra quando há `from`, como a lista faz hoje
 * (um `to` sozinho não recorta nada) — reproduzido de propósito.
 */
export function passesExtraFilters(
  c: ConversationWithMessages,
  ctx: ExtraFilterContext = {},
): boolean {
  const filters = ctx.filters;

  // Busca — trim só decide se há busca; a comparação usa o texto bruto,
  // igual à lista original ("resolvida " fica diferente de "Resolvida").
  const rawSearch = ctx.search ?? '';
  if (rawSearch.trim()) {
    const searchLower = rawSearch.toLowerCase();
    const nome = c.contact.name?.toLowerCase() ?? '';
    const email = c.contact.email?.toLowerCase() ?? '';
    if (
      !nome.includes(searchLower) &&
      !c.contact.phone.includes(rawSearch) &&
      !email.includes(searchLower)
    ) {
      return false;
    }
  }

  if (filters) {
    // Status do painel — mesmos estados do FSM persistido.
    if (filters.status?.length > 0) {
      const hasUnread = c.unreadCount > 0;
      const isAssigned = !!c.contact.assigned_to;
      const ok =
        (filters.status.includes('unread') && hasUnread) ||
        (filters.status.includes('read') && !hasUnread && isAssigned) ||
        (filters.status.includes('pending') && c.contact.conversation_status === 'waiting') ||
        (filters.status.includes('resolved') && c.contact.conversation_status === 'resolved');
      if (!ok) return false;
    }

    // Etiquetas — basta uma em comum.
    if (filters.tags?.length > 0) {
      const ctags = (c.contact as { tags?: string[] }).tags || [];
      if (!filters.tags.some((name) => ctags.includes(name))) return false;
    }

    // Atendente.
    if (filters.agentId && c.contact.assigned_to !== filters.agentId) return false;

    // Intervalo de datas — data da última mensagem, caindo para a criação do contato.
    if (filters.dateRange?.from) {
      const lastMessageDate = c.lastMessage
        ? new Date(c.lastMessage.created_at)
        : new Date(c.contact.created_at);
      if (isBefore(lastMessageDate, startOfDay(filters.dateRange.from))) return false;
      if (filters.dateRange.to && isAfter(lastMessageDate, endOfDay(filters.dateRange.to))) return false;
    }
  }

  // Tipo de contato — mesma regra do filterByContactType (sem tipo, 'all' ou
  // valor desconhecido: a lista não recorta).
  const tipo = ctx.selectedContactType;
  if (tipo && tipo !== 'all') {
    const option = FILTER_OPTIONS.find((o) => o.value === tipo);
    if (option && !option.match(c)) return false;
  }

  return true;
}

/** A conversa pertence ao chip, com as mesmas regras (e bordas) da lista. */
export function matchesChip(
  c: ConversationWithMessages,
  chip: ChipTab,
  profileId: string | undefined,
  opts: ChipCountOpts = {},
): boolean {
  if (!hasContact(c)) return false;
  if (isSnoozed(c, opts.snoozedIds)) return false;

  // A lista aplica a fila nos chips abertos e em Arquivadas, não em Resolvidas.
  const queueOk = !opts.selectedQueueId || isInQueue(c, opts.selectedQueueId);

  switch (chip) {
    case 'archived':
      return isArchived(c) && queueOk;
    case 'resolved':
      return isResolved(c);
    case 'waiting':
      return isOpenActive(c) && isWaiting(c) && queueOk;
    case 'attending':
      return isOpenActive(c) && (opts.showAll ? true : isAttending(c, profileId)) && queueOk;
    case 'unread':
      return isOpenActive(c) && isUnread(c) && queueOk;
    case 'all':
    default:
      return isOpenActive(c) && queueOk;
  }
}

/**
 * Totais dos chips, aplicando exatamente os predicados da lista: o contato
 * existe, não está adiado, passa nos filtros extras (busca, tipo, painel) e
 * satisfaz o chip. O número devolvido para cada chip é o `length` que a lista
 * teria com aquele chip ativo e os filtros atuais.
 *
 * Uma varredura das conversas, testando os seis chips por conversa — o custo
 * não cresce com a busca (que dispara a cada tecla).
 */
export function countByChip(
  conversations: ConversationWithMessages[],
  profileId: string | undefined,
  opts: ChipCountOpts = {},
): ChipCounts {
  const counts: ChipCounts = { all: 0, unread: 0, attending: 0, waiting: 0, resolved: 0, archived: 0 };
  for (const c of conversations ?? []) {
    if (!hasContact(c)) continue;
    if (isSnoozed(c, opts.snoozedIds)) continue;
    if (!passesExtraFilters(c, opts)) continue;
    for (const chip of CHIPS) {
      if (matchesChip(c, chip, profileId, opts)) counts[chip] += 1;
    }
  }
  return counts;
}
