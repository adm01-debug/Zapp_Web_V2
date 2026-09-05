import { useMemo, useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUrlFilters } from '@/hooks/system/useUrlFilters';
import { InboxFiltersState } from '@/components/inbox/InboxFilters';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { filterByContactType } from '@/components/inbox/ContactTypeFilter';
import { isAfter, isBefore, startOfDay, endOfDay, parseISO } from 'date-fns';
import { MainTab, SubTab } from '@/components/inbox/TicketTabs';
import { useFeatureFlag } from '@/hooks/system/useFeatureFlag';

interface UseInboxFiltersProps {
  conversations: ConversationWithMessages[];
  profileId: string | undefined;
}

export function useInboxFilters({ conversations, profileId }: UseInboxFiltersProps) {
  const fsmEnabled = useFeatureFlag('inbox.status-fsm', false);
  const [mainTab, setMainTab] = useState<MainTab>('open');
  const [subTab, setSubTab] = useState<SubTab>('attending');
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

  // Load contact_tags mapping
  const { data: contactTagsMap = {} } = useQuery({
    queryKey: ['contact-tags-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_tags')
        .select('contact_id, tag_id');
      if (error) throw error;
      const map: Record<string, string[]> = {};
      (data || []).forEach(ct => {
        if (!map[ct.contact_id]) map[ct.contact_id] = [];
        map[ct.contact_id].push(ct.tag_id);
      });
      return map;
    },
    staleTime: 30_000,
  });

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
      dateFrom: newFilters.dateRange.from?.toISOString().split('T')[0] || null,
      dateTo: newFilters.dateRange.to?.toISOString().split('T')[0] || null,
    });
  }, [setUrlFilters]);

  const filteredConversations = useMemo(() => {
    let result = conversations.filter(c => c && c.contact && c.contact.id);

    // Tab-based filtering
    if (mainTab === 'open') {
      result = fsmEnabled
        ? result.filter(c => c.contact.conversation_status === 'open' || c.contact.conversation_status === 'waiting')
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
        const tagIds = contactTagsMap[c.contact.id] || [];
        return filters.tags.some(filterTagId => tagIds.includes(filterTagId));
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
  }, [conversations, search, filters, mainTab, subTab, showAll, selectedQueueId, selectedContactType, profileId, contactTagsMap, fsmEnabled]);

  return {
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
