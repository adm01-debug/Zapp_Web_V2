import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Message } from '@/types/chat';

export type SearchFilter = 'all' | 'text' | 'image' | 'video' | 'audio' | 'document' | 'link';

export type DatePreset = 'all' | 'last_interaction' | 'today' | '3d' | '7d' | '14d' | '30d' | '90d' | 'custom';

const URL_REGEX = /https?:\/\/\S+/i;

/** Normalize text for accent-insensitive search */
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPresetRange(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: null };
    case '3d':
      return { from: startOfDay(new Date(now.getTime() - 3 * 86400000)), to: null };
    case '7d':
      return { from: startOfDay(new Date(now.getTime() - 7 * 86400000)), to: null };
    case '14d':
      return { from: startOfDay(new Date(now.getTime() - 14 * 86400000)), to: null };
    case '30d':
      return { from: startOfDay(new Date(now.getTime() - 30 * 86400000)), to: null };
    case '90d':
      return { from: startOfDay(new Date(now.getTime() - 90 * 86400000)), to: null };
    default:
      return { from: null, to: null };
  }
}

interface UseChatSearchOptions {
  messages: Message[];
  isOpen: boolean;
  onHighlightChange: (messageIds: Set<string>, activeId: string | null) => void;
  onNavigateToMessage: (messageId: string) => void;
  onSearchQueryChange?: (query: string) => void;
}

export function useChatSearch({
  messages,
  isOpen,
  onHighlightChange,
  onNavigateToMessage,
  onSearchQueryChange,
}: UseChatSearchOptions) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Date filter state
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customDateFrom, setCustomDateFrom] = useState<Date | null>(null);
  const [customDateTo, setCustomDateTo] = useState<Date | null>(null);

  // Stable refs for callbacks
  const onHighlightChangeRef = useRef(onHighlightChange);
  const onNavigateToMessageRef = useRef(onNavigateToMessage);
  onHighlightChangeRef.current = onHighlightChange;
  onNavigateToMessageRef.current = onNavigateToMessage;

  // Compute effective date range
  const dateRange = useMemo(() => {
    if (datePreset === 'custom') {
      return { from: customDateFrom, to: customDateTo };
    }
    if (datePreset === 'last_interaction') {
      // Find the start of the last interaction session (gap > 4h between messages)
      const sorted = [...messages].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (sorted.length === 0) return { from: null, to: null };
      const GAP_MS = 4 * 60 * 60 * 1000; // 4 hours
      let cutoff = new Date(sorted[0].timestamp);
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1].timestamp).getTime();
        const curr = new Date(sorted[i].timestamp).getTime();
        if (prev - curr > GAP_MS) {
          cutoff = new Date(sorted[i - 1].timestamp);
          break;
        }
        cutoff = new Date(sorted[i].timestamp);
      }
      return { from: startOfDay(cutoff), to: null };
    }
    return getPresetRange(datePreset);
  }, [datePreset, customDateFrom, customDateTo, messages]);

  const hasDateFilter = datePreset !== 'all';

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setFilter('all');
      setActiveIndex(0);
      setDatePreset('all');
      setCustomDateFrom(null);
      setCustomDateTo(null);
      onHighlightChangeRef.current(new Set(), null);
      onSearchQueryChange?.('');
    }
  }, [isOpen]);

  // Debounce query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      onSearchQueryChange?.(query);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Date filter helper
  const matchesDateRange = useCallback((msg: Message): boolean => {
    if (!hasDateFilter) return true;
    const msgDate = new Date(msg.timestamp);
    if (dateRange.from && msgDate < dateRange.from) return false;
    if (dateRange.to) {
      const endOfTo = new Date(dateRange.to);
      endOfTo.setHours(23, 59, 59, 999);
      if (msgDate > endOfTo) return false;
    }
    return true;
  }, [hasDateFilter, dateRange]);

  // Search logic — excludes deleted messages, accent-insensitive, date-filtered
  const results = useMemo(() => {
    const hasQuery = debouncedQuery.trim().length > 0;
    const hasTypeFilter = filter !== 'all';

    if (!hasQuery && !hasTypeFilter && !hasDateFilter) return [];

    return messages.filter((msg) => {
      if (msg.is_deleted) return false;

      // Date filter
      if (!matchesDateRange(msg)) return false;

      // Type filter
      if (filter === 'link') {
        if (!URL_REGEX.test(msg.content || '')) return false;
      } else if (filter !== 'all') {
        if (msg.type !== filter) return false;
      }

      // Text query filter
      if (!hasQuery) return hasTypeFilter || hasDateFilter;

      const q = normalizeText(debouncedQuery);
      const searchable = normalizeText(
        [msg.content, msg.transcription, msg.mediaUrl, msg.senderName].filter(Boolean).join(' ')
      );

      return searchable.includes(q);
    });
  }, [messages, debouncedQuery, filter, hasDateFilter, matchesDateRange]);

  // Compute counts per filter type for chips
  const filterCounts = useMemo(() => {
    const activeMessages = messages.filter((m) => !m.is_deleted && matchesDateRange(m));
    const matchesQuery = (msg: Message) => {
      if (!debouncedQuery.trim()) return true;
      const q = normalizeText(debouncedQuery);
      return normalizeText(
        [msg.content, msg.transcription, msg.mediaUrl, msg.senderName].filter(Boolean).join(' ')
      ).includes(q);
    };

    const counts: Record<SearchFilter, number> = {
      all: 0, text: 0, image: 0, video: 0, audio: 0, document: 0, link: 0,
    };

    for (const msg of activeMessages) {
      if (!matchesQuery(msg)) continue;
      counts.all++;
      if (msg.type === 'text') counts.text++;
      if (msg.type === 'image') counts.image++;
      if (msg.type === 'video') counts.video++;
      if (msg.type === 'audio') counts.audio++;
      if (msg.type === 'document') counts.document++;
      if (URL_REGEX.test(msg.content || '')) counts.link++;
    }
    return counts;
  }, [messages, debouncedQuery, matchesDateRange]);

  // Update highlights
  useEffect(() => {
    const ids = new Set(results.map((r) => r.id));
    const activeId = results[activeIndex]?.id || null;
    onHighlightChangeRef.current(ids, activeId);
    if (activeId) onNavigateToMessageRef.current(activeId);
  }, [results, activeIndex]);

  // Reset active index on criteria change
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, filter, datePreset, customDateFrom, customDateTo]);

  const navigateUp = useCallback(() => {
    if (results.length === 0) return;
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
  }, [results.length]);

  const navigateDown = useCallback(() => {
    if (results.length === 0) return;
    setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
  }, [results.length]);

  return {
    query,
    setQuery,
    filter,
    setFilter,
    activeIndex,
    setActiveIndex,
    debouncedQuery,
    results,
    filterCounts,
    navigateUp,
    navigateDown,
    datePreset,
    setDatePreset,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    hasDateFilter,
  };
}
