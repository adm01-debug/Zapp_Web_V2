import { useMemo, useCallback, useState } from 'react';
import { useUrlFilters } from '@/hooks/system/useUrlFilters';
import { InboxFiltersState } from '@/components/inbox/InboxFilters';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { filterByContactType } from '@/components/inbox/ContactTypeFilter';
import { isAfter, isBefore, startOfDay, endOfDay, parseISO } from 'date-fns';
import { localDayKey } from '@/lib/localDay';
import { MainTab, SubTab, ChipTab } from '@/components/inbox/TicketTabs';
import { useFeatureFlag } from '@/hooks/system/useFeatureFlag';

interface UseInboxFiltersProps {
  conversations: ConversationWithMessages[];
  profileId: string | undefined;
  // Contatos adiados (R2-INB-029): a lista ativa não mostra conversa adiada e a
  // retomada acontece quando o conjunto encolhe no vencimento do prazo.
  snoozedIds?: Set<string>;
}

export function useInboxFilters({ conversations, profileId, snoozedIds }: UseInboxFiltersProps) {
  const fsmEnabled = useFeatureFlag('inbox.status-fsm', false);
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

  const filteredConversations = useMemo(() => {
    let result = conversations.filter(c => c && c.contact && c.contact.id);

    // Adiamento (R2-INB-029): conversa adiada sai da listagem até o prazo vencer.
    // `snoozedIds` só traz os adiamentos ainda vigentes — no vencimento o hook de
    // origem a remove do conjunto e ela volta a aparecer sem recarregar a lista.
    if (snoozedIds && snoozedIds.size > 0) {
      result = result.filter(c => !snoozedIds.has(c.contact.id));
    }

    // Tab-based filtering
    if (mainTab === 'open') {
      result = fsmEnabled
        // Modo FSM: filtra por conversation_status E exige mensagens para não
        // inflar a inbox com contacts históricos sem atividade
        ? result.filter(c =>
            (c.contact.conversation_status === 'open' || c.contact.conversation_status === 'waiting')
            && c.messages.length > 0
          )
        : result.filter(c => c.messages.length > 0);
      if (subTab === 'attending') {
        if (!showAll) {
          result = result.filter(c => c.contact.assigned_to === profileId);
        }
      } else if (subTab === 'waiting') {
        result = fsmEnabled
          ? result.filter(c => c.contact.conversation_status === 'waiting')
          : result.filter(c => !c.contact.assigned_to);
      }
      if (selectedQueueId) {
        result = result.filter(c => c.contact.queue_id === selectedQueueId);
      }
    } else if (mainTab === 'resolved') {
      result = fsmEnabled
        ? result.filter(c => c.contact.conversation_status === 'resolved')
        : result.filter(c => c.messages.length === 0);
    }

    if (chipTab === 'unread') {
      result = result.filter(c => {
        const unreadMessages = (c.contact as unknown as { unread_messages?: number }).unread_messages ?? 0;
        return (c.unreadCount ?? 0) > 0 || unreadMessages > 0;
      });
    }
    // 'all' não filtra por assigned_to (subTab já vem null) — mostra todas abertas
    // attending e waiting já são tratados pelo subTab derivado

    // Search
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.contact.name.toLowerCase().includes(searchLower) ||
          c.contact.phone.includes(search) ||
          c.contact.email?.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (filters.status.length > 0) {
      result = result.filter((c) => {
        const hasUnread = c.unreadCount > 0;
        const isAssigned = !!c.contact.assigned_to;
        if (filters.status.includes('unread') && hasUnread) return true;
        if (filters.status.includes('read') && !hasUnread && isAssigned) return true;
        if (filters.status.includes('pending') && !isAssigned && c.messages.length > 0) return true;
        if (filters.status.includes('resolved') && c.messages.length === 0) return true;
        return false;
      });
    }

    // Tags filter
    if (filters.tags.length > 0) {
      result = result.filter((c) => {
        const ctags = (c.contact as { tags?: string[] }).tags || [];
        return filters.tags.some(name => ctags.includes(name));
      });
    }

    // Agent filter
    if (filters.agentId) {
      result = result.filter((c) => c.contact.assigned_to === filters.agentId);
    }

    // Date range filter
    if (filters.dateRange.from) {
      result = result.filter((c) => {
        const lastMessageDate = c.lastMessage
          ? new Date(c.lastMessage.created_at)
          : new Date(c.contact.created_at);
        if (filters.dateRange.from && isBefore(lastMessageDate, startOfDay(filters.dateRange.from))) return false;
        if (filters.dateRange.to && isAfter(lastMessageDate, endOfDay(filters.dateRange.to))) return false;
        return true;
      });
    }

    // Contact type filter
    result = filterByContactType(result, selectedContactType);

    // Smart sorting
    result.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : new Date(a.contact.updated_at).getTime();
      const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : new Date(b.contact.updated_at).getTime();
      return bTime - aTime;
    });

    return result;
  }, [conversations, search, filters, mainTab, subTab, chipTab, showAll, selectedQueueId, selectedContactType, profileId, fsmEnabled, snoozedIds]);

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
    clearUrlFilters,
  };
}
