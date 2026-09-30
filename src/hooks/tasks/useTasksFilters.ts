import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Priority } from './workItem.types';
import {
  DEFAULT_FILTERS,
  filtersFromSearch,
  isFilterActive,
  searchWithFilters,
  type TasksFilters,
} from './workItemFilters';

/**
 * Etapa 45: os filtros do módulo de Tarefas — `useReducer` como pede o plano,
 * busca com debounce de 200ms e estado espelhado na URL por `replaceState`
 * (sem empilhar histórico).
 *
 * A URL é a fonte da verdade na montagem; daí em diante escrevemos nela a cada
 * mudança. O que volta para a tela é sempre o estado do reducer — nunca a URL —
 * para não re-renderizar a cada `replaceState`.
 */

type Action =
  | { type: 'q'; value: string }
  | { type: 'prio'; value: Priority | 'all' }
  | { type: 'contact'; value: string | null }
  | { type: 'toggleAlarm' }
  | { type: 'toggleDone' }
  | { type: 'clear' };

export const SEARCH_DEBOUNCE_MS = 200;

function reducer(state: TasksFilters, action: Action): TasksFilters {
  switch (action.type) {
    case 'q':           return { ...state, q: action.value };
    case 'prio':        return { ...state, prio: action.value };
    case 'contact':     return { ...state, contact: action.value };
    case 'toggleAlarm': return { ...state, alarm: !state.alarm };
    case 'toggleDone':  return { ...state, done: !state.done };
    case 'clear':       return DEFAULT_FILTERS;
  }
}

export function useTasksFilters() {
  const location = useLocation();
  const [filters, dispatch] = useReducer(reducer, undefined, () =>
    // O `search` do router é a fonte (em produção ele é o próprio
    // `window.location.search`); o fallback cobre o router em memória dos testes.
    filtersFromSearch(
      typeof window === 'undefined' ? '' : (location.search || window.location.search)
    )
  );

  // Busca com debounce: o texto digitado vai para um estado local e só depois de
  // 200ms vira filtro — a URL e o recorte acompanham o valor debounced.
  const [textoDaBusca, setTextoDaBusca] = useState(filters.q);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSearch = useCallback((value: string) => {
    setTextoDaBusca(value);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => dispatch({ type: 'q', value }), SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  // Estado → URL, sem empilhar histórico. O `view` da rota é preservado.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = searchWithFilters(location.search, filters);
    const atual = `${window.location.pathname}${window.location.search}`;
    const novo = `${window.location.pathname}${qs}`;
    if (atual !== novo) window.history.replaceState(null, '', novo);
  }, [filters, location.search]);

  return {
    filters,
    textoDaBusca,
    setSearch,
    setPrio:        (value: Priority | 'all') => dispatch({ type: 'prio', value }),
    setContact:     (value: string | null) => dispatch({ type: 'contact', value }),
    toggleAlarm:    () => dispatch({ type: 'toggleAlarm' }),
    toggleDone:     () => dispatch({ type: 'toggleDone' }),
    // "Limpar" zera o texto JUNTO com o filtro — sem efeito de sincronização.
    clear:          () => { setTextoDaBusca(''); dispatch({ type: 'clear' }); },
    isActive:       isFilterActive(filters),
  };
}
