import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ContactService, Contact } from '@/services/contact.service';
import { filterCustomTags } from '@/lib/tags';
import { appDayStart } from '@/lib/localDay';
import {
  CONTACTS_AGGREGATE_QUERY_OPTIONS,
  readShowLegacyPreference,
  writeShowLegacyPreference,
} from './contactsAggregates';

const PAGE_SIZE = 50;

const DATE_RANGE_OPTIONS = ['all', 'today', 'week', 'month', 'quarter', 'year'] as const;
const SORT_OPTIONS = ['name_asc', 'name_desc', 'created_desc', 'created_asc', 'updated_desc'] as const;

function parseSortOption(sortBy: string): { field: string; direction: string } {
  switch (sortBy) {
    case 'name_desc': return { field: 'name', direction: 'desc' };
    case 'created_desc': return { field: 'created_at', direction: 'desc' };
    case 'created_asc': return { field: 'created_at', direction: 'asc' };
    case 'updated_desc': return { field: 'updated_at', direction: 'desc' };
    default: return { field: 'name', direction: 'asc' };
  }
}

/** Valor da URL é texto arbitrário (qualquer um edita o endereço): corta e valida. */
function paramTexto(valor: string | null, max = 120): string {
  return typeof valor === 'string' ? valor.slice(0, max) : '';
}

function paramOpcao<T extends readonly string[]>(opcoes: T, valor: string | null, padrao: T[number]): T[number] {
  return (valor && (opcoes as readonly string[]).includes(valor) ? valor : padrao) as T[number];
}

/** `?p=2` é a segunda página; ausente/ inválido/ `< 1` cai na primeira (índice 0). */
function paramPagina(valor: string | null): number {
  const n = Number.parseInt(valor ?? '', 10);
  return Number.isFinite(n) && n > 1 ? n - 1 : 0;
}

/**
 * Lista de Contatos com busca, filtros, ordenação e página espelhados na URL
 * (`?q,tab,company,job,date,sort,p`). Recarregar a página (ou abrir um link com esses
 * parâmetros) devolve o mesmo estado; cada mudança usa `replace`, então filtrar não
 * empilha entradas no histórico.
 *
 * A `tag` fica de fora de propósito: a tela de Contatos não filtra por etiqueta
 * (função excluída do sistema) e `filterTag` continua só em memória, para quem ainda
 * monta um filtro de tags por conta própria.
 */
export function useContactsSearch() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Semente única na montagem: o estado lê a URL uma vez; quem escreve é o efeito abaixo.
  const [searchInput, setSearchInput] = useState(() => paramTexto(searchParams.get('q')));
  const [debouncedSearch, setDebouncedSearch] = useState(() => paramTexto(searchParams.get('q')));
  const [activeTab, setActiveTab] = useState(() => paramTexto(searchParams.get('tab')) || 'all');
  const [filterCompany, setFilterCompany] = useState(() => paramTexto(searchParams.get('company')));
  const [filterJobTitle, setFilterJobTitle] = useState(() => paramTexto(searchParams.get('job')));
  const [filterTag, setFilterTag] = useState('');
  const [filterDateRange, setFilterDateRange] = useState<string>(() => paramOpcao(DATE_RANGE_OPTIONS, searchParams.get('date'), 'all'));
  const [sortBy, setSortBy] = useState<string>(() => paramOpcao(SORT_OPTIONS, searchParams.get('sort'), 'name_asc'));
  const [page, setPage] = useState(() => paramPagina(searchParams.get('p')));
  const [showLegacy, setShowLegacyState] = useState(readShowLegacyPreference);
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
  const handleShowLegacyChange = useCallback((v: boolean) => {
    writeShowLegacyPreference(v);
    setShowLegacyState(v);
    setPage(0);
  }, []);

  /**
   * Espelha o estado na URL depois de cada mudança. `replace` mantém o histórico limpo;
   * o estado só é reescrito quando algo difere, então não há laço de navegação. A `tag`
   * não entra aqui (ver o cabeçalho do hook).
   */
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const setOuRemove = (chave: string, valor: string) => {
      if (valor) params.set(chave, valor); else params.delete(chave);
    };
    setOuRemove('q', debouncedSearch);
    setOuRemove('tab', activeTab === 'all' ? '' : activeTab);
    setOuRemove('company', filterCompany);
    setOuRemove('job', filterJobTitle);
    setOuRemove('date', filterDateRange === 'all' ? '' : filterDateRange);
    setOuRemove('sort', sortBy === 'name_asc' ? '' : sortBy);
    setOuRemove('p', page > 0 ? String(page + 1) : '');

    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [debouncedSearch, activeTab, filterCompany, filterJobTitle, filterDateRange, sortBy, page, searchParams, setSearchParams]);

  const dateFrom = useMemo(() => {
    const now = new Date();
    switch (filterDateRange) {
      // "Hoje" é o dia civil no fuso do app (America/Sao_Paulo), não as últimas 24h:
      // às 09h o balcão espera ver tudo desde 00:00, não o que chegou depois das 09h de ontem.
      case 'today': return appDayStart(0).toISOString();
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
    showLegacy,
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
        include_legacy: showLegacy,
      });
      if (error) throw error;
      return data as (Contact & { total_count: number })[];
    },
    // Lista, `totalCount` e contadores revalidam juntos ao abrir a tela: senão as
    // abas mostram um contato criado fora de Contatos que a lista ainda omite.
    ...CONTACTS_AGGREGATE_QUERY_OPTIONS,
  });

  const contacts = useMemo(() => data ?? [], [data]);
  const totalCount = contacts.length > 0 ? Number(contacts[0].total_count) : 0;
  const hasMore = (page + 1) * PAGE_SIZE < totalCount;

  const { data: typeCounts } = useQuery({
    queryKey: ['contacts-type-counts', showLegacy],
    queryFn: async () => {
      const { data, error } = await ContactService.getCountsByType(showLegacy);
      if (error) throw error;
      return (data as { contact_type: string; count: number }[]) ?? [];
    },
    staleTime: 30000,
    ...CONTACTS_AGGREGATE_QUERY_OPTIONS,
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

  // ────────────────────────────────────────────────────────────────────────

  // ─── Permissão de exclusão por linha (RPC can_delete_contacts) ───────────
  // Mesma RPC-por-página do "último contato": o servidor responde com o MESMO
  // predicado que a exclusão usa (`can_edit_contact`), então a lista nunca
  // oferece "Excluir" em contato que o banco vai recusar. Enquanto a resposta
  // não chega (ou se a RPC falhar), `can_delete` fica indefinido e o item
  // continua aparecendo -- o comportamento anterior.
  const { data: canDeleteMap } = useQuery({
    queryKey: ['contacts-can-delete', contactIds],
    queryFn: async () => {
      const { data, error } = await ContactService.getDeletableContacts(contactIds);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((row) => {
        map[row.contact_id] = row.can_delete;
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
      can_delete: canDeleteMap?.[c.id],
    })),
    [contacts, lastMsgMap, lastMsgSuccess, canDeleteMap]
  );
  // ────────────────────────────────────────────────────────────────────────

  const uniqueCompanies = useMemo(() => [...new Set(contacts.map(c => c.company).filter(Boolean))] as string[], [contacts]);
  const uniqueJobTitles = useMemo(() => [...new Set(contacts.map(c => c.job_title).filter(Boolean))] as string[], [contacts]);
  const uniqueTags = useMemo(() => filterCustomTags([...new Set(contacts.flatMap(c => c.tags || []))]), [contacts]);

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
    showLegacy,
    setShowLegacy: handleShowLegacyChange,
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
