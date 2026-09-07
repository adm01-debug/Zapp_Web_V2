import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContactService, Contact } from '@/services/contact.service';

const PAGE_SIZE = 50;

function parseSortOption(sortBy: string): { field: string; direction: string } {
  switch (sortBy) {
    case 'name_desc': return { field: 'name', direction: 'desc' };
    case 'created_desc': return { field: 'created_at', direction: 'desc' };
    case 'created_asc': return { field: 'created_at', direction: 'asc' };
    case 'updated_desc': return { field: 'updated_at', direction: 'desc' };
    default: return { field: 'name', direction: 'asc' };
  }
}

export function useContactsSearch() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterJobTitle, setFilterJobTitle] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterDateRange, setFilterDateRange] = useState('all');
  const [sortBy, setSortBy] = useState('name_asc');
  const [page, setPage] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 400);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleTabChange = useCallback((v: string) => { setActiveTab(v); setPage(0); }, []);
  const handleCompanyChange = useCallback((v: string) => { setFilterCompany(v); setPage(0); }, []);
  const handleJobTitleChange = useCallback((v: string) => { setFilterJobTitle(v); setPage(0); }, []);
  const handleTagChange = useCallback((v: string) => { setFilterTag(v); setPage(0); }, []);
  const handleDateRangeChange = useCallback((v: string) => { setFilterDateRange(v); setPage(0); }, []);
  const handleSortChange = useCallback((v: string) => { setSortBy(v); setPage(0); }, []);

  const dateFrom = useMemo(() => {
    const now = new Date();
    switch (filterDateRange) {
      case 'today': return new Date(now.getTime() - 86400000).toISOString();
      case 'week': return new Date(now.getTime() - 7 * 86400000).toISOString();
      case 'month': return new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      case 'quarter': return new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString();
      case 'year': return new Date(new Date().setMonth(new Date().getMonth() - 12)).toISOString();
      default: return null;
    }
  }, [filterDateRange]);

  const { field: sortField, direction: sortDirection } = parseSortOption(sortBy);

  const queryKey = [
    'contacts-search',
    debouncedSearch,
    activeTab,
    filterCompany,
    filterJobTitle,
    filterTag,
    dateFrom,
    sortField,
    sortDirection,
    page,
  ];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await ContactService.searchContacts({
        search_term: debouncedSearch,
        contact_type_filter: activeTab === 'all' ? null : activeTab,
        company_filter: filterCompany,
        job_title_filter: filterJobTitle,
        tag_filter: filterTag,
        date_from: dateFrom,
        sort_field: sortField,
        sort_direction: sortDirection,
        page_size: PAGE_SIZE,
        page_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return data as (Contact & { total_count: number })[];
    },
  });

  const contacts = useMemo(() => data ?? [], [data]);
  const totalCount = contacts.length > 0 ? Number(contacts[0].total_count) : 0;
  const hasMore = (page + 1) * PAGE_SIZE < totalCount;

  const { data: typeCounts } = useQuery({
    queryKey: ['contacts-type-counts'],
    queryFn: async () => {
      const { data, error } = await ContactService.getCountsByType();
      if (error) throw error;
      return (data as { contact_type: string; count: number }[]) ?? [];
    },
    staleTime: 30000,
  });

  const contactCountByType = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    typeCounts?.forEach((row) => {
      map[row.contact_type] = Number(row.count);
      total += Number(row.count);
    });
    map['all'] = total;
    return map;
  }, [typeCounts]);

  // ─── Último contato: RPC get_last_message_dates (GROUP BY contact_id) ───
  const contactIds = useMemo(() => contacts.map(c => c.id), [contacts]);

  const { data: lastMsgMap, isSuccess: lastMsgSuccess } = useQuery({
    queryKey: ['contacts-last-message', contactIds],
    queryFn: async () => {
      const { data, error } = await ContactService.getLastMessageDates(contactIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((row) => {
        map[row.contact_id] = row.last_message_at;
      });
      return map;
    },
    enabled: contactIds.length > 0,
    staleTime: 30_000,
  });

  const contactsEnriched = useMemo(() =>
    contacts.map(c => ({
      ...c,
      ...(lastMsgSuccess && { last_message_at: lastMsgMap?.[c.id] ?? null }),
    })),
    [contacts, lastMsgMap, lastMsgSuccess]
  );
  // ────────────────────────────────────────────────────────────────────────

  const uniqueCompanies = useMemo(() => [...new Set(contacts.map(c => c.company).filter(Boolean))] as string[], [contacts]);
  const uniqueJobTitles = useMemo(() => [...new Set(contacts.map(c => c.job_title).filter(Boolean))] as string[], [contacts]);
  const uniqueTags = useMemo(() => [...new Set(contacts.flatMap(c => c.tags || []))] as string[], [contacts]);

  const activeFiltersCount = [filterCompany, filterJobTitle, filterTag, filterDateRange !== 'all' ? filterDateRange : ''].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setFilterCompany('');
    setFilterJobTitle('');
    setFilterTag('');
    setFilterDateRange('all');
    setSortBy('name_asc');
    setPage(0);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setPage(0);
  }, []);

  return {
    contacts: contactsEnriched,
    totalCount,
    loading: isLoading,
    error,
    hasMore,
    contactCountByType,
    uniqueCompanies,
    uniqueJobTitles,
    uniqueTags,
    searchInput,
    debouncedSearch,
    handleSearchChange,
    clearSearch,
    activeTab,
    setActiveTab: handleTabChange,
    filterCompany,
    setFilterCompany: handleCompanyChange,
    filterJobTitle,
    setFilterJobTitle: handleJobTitleChange,
    filterTag,
    setFilterTag: handleTagChange,
    filterDateRange,
    setFilterDateRange: handleDateRangeChange,
    sortBy,
    setSortBy: handleSortChange,
    activeFiltersCount,
    clearFilters,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    loadMore: () => setPage(p => p + 1),
    loadPrevious: () => setPage(p => Math.max(0, p - 1)),
    refetch,
  };
}
