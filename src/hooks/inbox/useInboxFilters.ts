import { useMemo, useCallback, useState } from 'react';
import { useUrlFilters } from '@/hooks/system/useUrlFilters';
import { InboxFiltersState } from '@/components/inbox/InboxFilters';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { parseISO } from 'date-fns';
import { localDayKey } from '@/lib/localDay';
import { MainTab, SubTab, ChipTab } from '@/components/inbox/TicketTabs';
import {
  hasContact,
  isSnoozed,
  isUnread,
  isOpenActive,
  isAttending,
  isWaiting,
  isResolved,
  isArchived,
  isInQueue,
  passesExtraFilters,
  countByChip,
} from './chipCounts';

interface UseInboxFiltersProps {
  conversations: ConversationWithMessages[];
  profileId: string | undefined;
  // Contatos adiados (R2-INB-029): a lista ativa não mostra conversa adiada e a
  // retomada acontece quando o conjunto encolhe no vencimento do prazo.
  snoozedIds?: Set<string>;
}

export function useInboxFilters({ conversations, profileId, snoozedIds }: UseInboxFiltersProps) {
  const [chipTab, setChipTabState] = useState<ChipTab>('attending');
  const [mainTab, setMainTab] = useState<MainTab>('open');
  const [subTab, setSubTab] = useState<SubTab | null>('attending');
  // Chips derivam mainTab/subTab (compat com filtros existentes). setMainTab/setSubTab
  // seguem expostos à parte — RealtimeInboxView usa setMainTab('search') no deep-link
  // de contato pendente, fora do ciclo de vida dos chips.
  const setChipTab = useCallback((tab: ChipTab) => {
    setChipTabState(tab);
    setMainTab(tab === 'resolved' ? 'resolved' : 'open');
    setSubTab(tab === 'attending' ? 'attending' : tab === 'waiting' ? 'waiting' : null);
  }, []);
  const [showAll, setShowAll] = useState(false);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [selectedContactType, setSelectedContactType] = useState<string | null>(() => {
    const typeFromUrl = new URLSearchParams(window.location.search).get('type');
    return typeFromUrl && typeFromUrl !== 'all' ? typeFromUrl : null;
  });

  const { filters: urlFilters, setFilters: setUrlFilters, clearFilters: clearUrlFilters } = useUrlFilters();

  const handleContactTypeChange = useCallback((value: string | null) => {
    setSelectedContactType(value);
    const params = new URLSearchParams(window.location.search);
    if (value && value !== 'all') {
      params.set('type', value);
    } else {
      params.delete('type');
    }
    window.history.replaceState(null, '', params.toString() ? `?${params}` : window.location.pathname + window.location.hash);
  }, []);

  // Convert URL filters to InboxFiltersState
  const filters = useMemo<InboxFiltersState>(() => ({
    status: urlFilters.status,
    tags: urlFilters.tags,
    agentId: urlFilters.agentId,
    dateRange: {
      from: urlFilters.dateFrom ? parseISO(urlFilters.dateFrom) : null,
      to: urlFilters.dateTo ? parseISO(urlFilters.dateTo) : null,
    },
  }), [urlFilters]);

  const search = urlFilters.search;
  const setSearch = useCallback((value: string) => {
    setUrlFilters({ search: value });
  }, [setUrlFilters]);

  const setFilters = useCallback((newFilters: InboxFiltersState) => {
    setUrlFilters({
      status: newFilters.status,
      tags: newFilters.tags,
      agentId: newFilters.agentId,
      dateFrom: localDayKey(newFilters.dateRange.from),
      dateTo: localDayKey(newFilters.dateRange.to),
    });
  }, [setUrlFilters]);

  // Contexto dos filtros extras (busca, tipo, painel) — o MESMO objeto alimenta
  // a lista e o countByChip, para os dois nunca usarem regras diferentes.
  const extraFilterContext = useMemo(
    () => ({ search, selectedContactType, filters }),
    [search, selectedContactType, filters],
  );

  const filteredConversations = useMemo(() => {
    let result = conversations.filter(hasContact);

    // Adiamento (R2-INB-029): conversa adiada sai da listagem até o prazo vencer.
    // `snoozedIds` só traz os adiamentos ainda vigentes — no vencimento o hook de
    // origem a remove do conjunto e ela volta a aparecer sem recarregar a lista.
    result = result.filter(c => !isSnoozed(c, snoozedIds));

    // Tab-based filtering — ADR-005 (passo 3): o estado da conversa vem do campo
    // persistido `contacts.conversation_status`, e não mais da derivação por
    // `messages.length` (que mostrava como "aberta" toda conversa com mensagem e
    // como "resolvida" apenas a que nunca teve nenhuma).
    // As regras de cada chip vivem em ./chipCounts (as mesmas que contam os chips).
    if (chipTab === 'archived') {
      // Chip "Arquivadas" (B2): a lista obedece o estado persistido
      // `conversation_status === 'archived'`, independente de mainTab/subTab
      // (o chip deriva mainTab 'open'/subTab null, ramo que não conhece esse
      // estado). Busca, fila e tipo de contato seguem aplicados por cima,
      // abaixo — por isso só o filtro de fila, que hoje vive no ramo 'open',
      // é replicado aqui.
      result = result.filter(isArchived);
      if (selectedQueueId) {
        result = result.filter(c => isInQueue(c, selectedQueueId));
      }
    } else if (mainTab === 'open') {
      // Ativas = open|waiting. O `messages.length > 0` abaixo não decide estado:
      // é o guarda de atividade que mantém fora da inbox o contato histórico que
      // nunca conversou (buildConversation sintetiza 1 mensagem quando há agregado).
      result = result.filter(isOpenActive);
      if (subTab === 'attending') {
        if (!showAll) {
          result = result.filter(c => isAttending(c, profileId));
        }
      } else if (subTab === 'waiting') {
        result = result.filter(isWaiting);
      }
      if (selectedQueueId) {
        result = result.filter(c => isInQueue(c, selectedQueueId));
      }
    } else if (mainTab === 'resolved') {
      result = result.filter(isResolved);
    }

    if (chipTab === 'unread') {
      result = result.filter(isUnread);
    }
    // 'all' não filtra por assigned_to (subTab já vem null) — mostra todas abertas
    // attending e waiting já são tratados pelo subTab derivado

    // Filtros por cima do chip — busca, painel Filtros (status/tags/atendente/
    // datas) e tipo de contato. A regra vive em passesExtraFilters, em
    // ./chipCounts: é a MESMA que o countByChip aplica, então o número do chip e
    // o length da lista não têm mais como divergir.
    result = result.filter((c) => passesExtraFilters(c, extraFilterContext));

    // Smart sorting
    result.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : new Date(a.contact.updated_at).getTime();
      const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : new Date(b.contact.updated_at).getTime();
      return bTime - aTime;
    });

    return result;
  }, [conversations, extraFilterContext, mainTab, subTab, chipTab, showAll, selectedQueueId, profileId, snoozedIds]);

  // Contadores dos chips com o contexto atual — a tela só lê o número. Memoizado
  // pelos mesmos insumos da lista; cada tecla da busca recalcula UMA varredura
  // (o loop testa os seis chips por conversa), sem uma passada por chip.
  const chipCounts = useMemo(
    () =>
      countByChip(conversations, profileId, {
        snoozedIds,
        showAll,
        selectedQueueId,
        ...extraFilterContext,
      }),
    [conversations, profileId, snoozedIds, showAll, selectedQueueId, extraFilterContext],
  );

  return {
    chipTab, setChipTab,
    mainTab, setMainTab,
    subTab, setSubTab,
    showAll, setShowAll,
    selectedQueueId, setSelectedQueueId,
    selectedContactType, handleContactTypeChange,
    filters, setFilters,
    search, setSearch,
    filteredConversations,
    chipCounts,
    clearUrlFilters,
  };
}
