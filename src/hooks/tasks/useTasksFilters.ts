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
  | { type: 'hydrate'; value: TasksFilters }
  | { type: 'clear' };

export const SEARCH_DEBOUNCE_MS = 200;

function reducer(state: TasksFilters, action: Action): TasksFilters {
  switch (action.type) {
    case 'q':           return { ...state, q: action.value };
    case 'prio':        return { ...state, prio: action.value };
    case 'contact':     return { ...state, contact: action.value };
    case 'toggleAlarm': return { ...state, alarm: !state.alarm };
    case 'toggleDone':  return { ...state, done: !state.done };
    case 'hydrate':     return action.value;
    case 'clear':       return DEFAULT_FILTERS;
  }
}

export function useTasksFilters() {
  const location = useLocation();
  // Fase F (auditoria): a MESMA base de URL na leitura e na escrita. O `search`
  // do router é a fonte em produção; o fallback cobre o router em memória dos testes.
  const searchAtual = typeof window === 'undefined' ? '' : (location.search || window.location.search);
  const [filters, dispatch] = useReducer(reducer, undefined, () => filtersFromSearch(searchAtual));

  // Busca com debounce: o texto digitado vai para um estado local e só depois de
  // 200ms vira filtro — a URL e o recorte acompanham o valor debounced.
  const [textoDaBusca, setTextoDaBusca] = useState(filters.q);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fase F (auditoria): a URL voltou a ser fonte da verdade DEPOIS da montagem.
  // Quem sinaliza navegação é o `search` do ROUTER — não o `window.location`, que
  // este hook reescreve a cada mudança de filtro (reidratar nesse caso seria laço).
  // É ajuste durante o render — o padrão do React para "o dado de fora mudou" — e
  // não um efeito de sincronização.
  const [searchDoRouter, setSearchDoRouter] = useState(location.search);
  if (location.search !== searchDoRouter) {
    setSearchDoRouter(location.search);
    const hidratado = filtersFromSearch(
      location.search || (typeof window === 'undefined' ? '' : window.location.search)
    );
    setTextoDaBusca(hidratado.q);
    dispatch({ type: 'hydrate', value: hidratado });
  }

  const setSearch = useCallback((value: string) => {
    setTextoDaBusca(value);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Se a URL mudar entre digitar e aplicar (navegação no meio do debounce), a URL vence.
    const base = typeof window === 'undefined' ? '' : window.location.search;
    timeoutRef.current = setTimeout(() => {
      const agora = typeof window === 'undefined' ? '' : window.location.search;
      if (agora !== base) return;
      dispatch({ type: 'q', value });
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  // Estado → URL, sem empilhar histórico. O `view` da rota é preservado.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = searchWithFilters(searchAtual, filters);
    const atual = `${window.location.pathname}${window.location.search}`;
    const novo = `${window.location.pathname}${qs}`;
    if (atual !== novo) window.history.replaceState(null, '', novo);
  }, [filters, searchAtual]);

  return {
    filters,
    textoDaBusca,
    setSearch,
    setPrio:        (value: Priority | 'all') => dispatch({ type: 'prio', value }),
    setContact:     (value: string | null) => dispatch({ type: 'contact', value }),
    toggleAlarm:    () => dispatch({ type: 'toggleAlarm' }),
    toggleDone:     () => dispatch({ type: 'toggleDone' }),
    // "Limpar" zera o texto JUNTO com o filtro — e CANCELA o debounce pendente,
    // que senão ressurge 200ms depois com o filtro antigo (Fase F/auditoria).
    clear:          () => {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setTextoDaBusca('');
      dispatch({ type: 'clear' });
    },
    isActive:       isFilterActive(filters),
  };
}
