import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EMAIL_THREAD_DEFAULT_FILTERS,
  readEmailThreadFiltersFromUrl,
  writeEmailThreadFiltersToUrl,
  type EmailThreadListFilters,
  type EmailThreadListQuery,
} from '@/lib/emailThreadQuery';

/**
 * OTH-005 — estado da lista de Email (filtros + página) fora do componente.
 *
 * Quem guarda os filtros é quem manda a consulta; a lista virou apresentação. Duas coisas
 * moram aqui e não na tela:
 *   - a página, que é a janela pedida ao servidor;
 *   - a espera curta da busca (`query` só troca 300 ms depois da última tecla), para que
 *     digitar não dispare uma consulta por caractere.
 *
 * Os filtros continuam espelhados na URL (mesmas chaves de antes:
 * `emailFilter`/`emailAttachment`/`emailLabel`/`emailPeriod`/`emailQuery`), preservando
 * deep link e a rota ativa.
 */
export const EMAIL_THREAD_SEARCH_DEBOUNCE_MS = 300;

export interface EmailThreadListQueryState {
  /** Filtros como a tela os mostra (a busca é o texto já digitado). */
  filters: EmailThreadListFilters;
  page: number;
  /** O que deve ir ao servidor: busca com espera curta aplicada. */
  query: EmailThreadListQuery;
  setPage: (page: number) => void;
  updateFilters: (patch: Partial<Omit<EmailThreadListFilters, 'search'>>) => void;
  setSearch: (term: string) => void;
  resetFilters: () => void;
}

export function useEmailThreadListQuery(): EmailThreadListQueryState {
  const initial = useMemo(
    () => readEmailThreadFiltersFromUrl(new URLSearchParams(window.location.search)),
    [],
  );
  const [filters, setFilters] = useState<EmailThreadListFilters>({ ...initial, search: '' });
  const [searchTerm, setSearchTerm] = useState(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), EMAIL_THREAD_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const url = new URL(window.location.href);
    writeEmailThreadFiltersToUrl(url, { ...filters, search: searchTerm });
    window.history.replaceState(window.history.state, '', url);
  }, [filters, searchTerm]);

  const updateFilters = useCallback((patch: Partial<Omit<EmailThreadListFilters, 'search'>>) => {
    setFilters(previous => ({ ...previous, ...patch }));
    setPage(1);
  }, []);

  const setSearch = useCallback((term: string) => {
    setSearchTerm(term);
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMAIL_THREAD_DEFAULT_FILTERS);
    setSearchTerm('');
    setDebouncedSearch('');
    setPage(1);
  }, []);

  return {
    filters: { ...filters, search: searchTerm },
    page,
    query: { ...filters, search: debouncedSearch, page },
    setPage,
    updateFilters,
    setSearch,
    resetFilters,
  };
}
