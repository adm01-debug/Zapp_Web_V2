import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { suggestPlaces, retrievePlace } from '@/lib/mapboxGeocode';
import type { GeoSuggestion, GeoFailureKind, GeoProximity, GeoSearchPlace } from '@/lib/mapboxGeocode';
import { getSearchSession, noteSuggestCall, noteRetrieveCall, endSearchSession } from '@/lib/mapboxSession';
import { isSearchBudgetOk } from '@/lib/mapboxCostGuard';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;
const RATE_LIMIT_BACKOFF_MS = 60_000;

export interface UseAddressAutocompleteOptions {
  token: string | null;
  proximity?: GeoProximity;
  enabled: boolean;
  /** Filtro de tipo do `/suggest` (ex: `'address,street,place'` no cadastro de contato, sem POI). */
  types?: string;
  /** Origem gravada em `searchbox_session` (E35) — `'picker'` por padrão para não mudar a telemetria do picker existente. */
  sessionSource?: string;
}

export interface UseAddressAutocompleteResult {
  query: string;
  setQuery: (query: string) => void;
  suggestions: GeoSuggestion[];
  isLoading: boolean;
  error: GeoFailureKind | null;
  highlightedIndex: number;
  /** `id` da sugestão com um `/retrieve` em voo, ou `null` — para o item individual, não a lista. */
  retrievingId: string | null;
  /** Chama `retrievePlace()` pela sugestão no índice, devolve a coordenada e encerra a sessão. */
  select: (index: number) => Promise<GeoSearchPlace | null>;
  /**
   * ↓/↑/Home/End movem `highlightedIndex`; `Esc` limpa (e encerra a sessão — E46). `Enter` com
   * item destacado só previne o padrão do input — quem usa decide chamar `select(highlightedIndex)`
   * (antes do E46 o próprio hook chamava `select()` aqui e descartava o resultado com `void`; quem
   * usa nunca ficava sabendo que uma seleção por teclado tinha acontecido). Sem item destacado,
   * `Enter` não faz nada aqui — o hook não decide o fallback para a busca antiga (`/forward`);
   * isso é decisão de quem usa (Fase 3).
   */
  onKeyDown: (event: KeyboardEvent) => void;
  /** Limpa query, sugestões e destaque — usado pelo `Esc` e por quem usa o hook. */
  clear: () => void;
}

interface State {
  query: string;
  suggestions: GeoSuggestion[];
  isLoading: boolean;
  error: GeoFailureKind | null;
  highlightedIndex: number;
  retrievingId: string | null;
  /** E38: timestamp até quando o /suggest fica em backoff após um 429. */
  rateLimitedUntil: number | null;
}

const initialState: State = {
  query: '',
  suggestions: [],
  isLoading: false,
  error: null,
  highlightedIndex: -1,
  retrievingId: null,
  rateLimitedUntil: null,
};

type Action =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SUGGEST_START' }
  | { type: 'SUGGEST_SUCCESS'; suggestions: GeoSuggestion[] }
  | { type: 'SUGGEST_ERROR'; kind: GeoFailureKind; rateLimitedUntil?: number }
  | { type: 'RETRIEVE_START'; id: string }
  | { type: 'RETRIEVE_END' }
  | { type: 'RETRIEVE_ERROR'; kind: GeoFailureKind }
  | { type: 'HIGHLIGHT'; index: number }
  | { type: 'CLEAR' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.query, error: null };
    case 'SUGGEST_START':
      return { ...state, isLoading: true, error: null };
    case 'SUGGEST_SUCCESS':
      return { ...state, isLoading: false, error: null, suggestions: action.suggestions, highlightedIndex: -1 };
    case 'SUGGEST_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.kind,
        suggestions: [],
        rateLimitedUntil: action.rateLimitedUntil ?? null,
      };
    case 'RETRIEVE_START':
      // Falha de retrieve não fecha a lista: só o item some do estado de carregamento
      // (RETRIEVE_END), as sugestões continuam de pé.
      return { ...state, retrievingId: action.id, error: null };
    case 'RETRIEVE_END':
      return { ...state, retrievingId: null };
    case 'RETRIEVE_ERROR':
      // Falha do /retrieve nunca fecha a lista — só marca a causa; as sugestões continuam de pé.
      return { ...state, retrievingId: null, error: action.kind };
    case 'HIGHLIGHT':
      return { ...state, highlightedIndex: action.index };
    case 'CLEAR':
      return { ...initialState };
    default:
      return state;
  }
}

/**
 * Autocomplete estilo playground da Mapbox (`/suggest` enquanto digita): debounce, piso de
 * caracteres, cancelamento, seleção/retrieve e teclado. Não sabe de UI nem de feature flag: só
 * trabalha quando `enabled`. Compartilhado entre o picker de localização do inbox (Fase 2 do plano
 * de busca) e o autocomplete de endereço do cadastro de contato (Fase 6) — `types`/`sessionSource`
 * existem para o segundo consumidor não herdar filtro nem telemetria do primeiro.
 */
export function useAddressAutocomplete(options: UseAddressAutocompleteOptions): UseAddressAutocompleteResult {
  const { token, proximity, enabled, types, sessionSource = 'picker' } = options;
  const [state, dispatch] = useReducer(reducer, initialState);
  // Consulta corrente do /suggest: aborta a anterior antes de abrir uma nova, pra resposta
  // lenta da 1ª nunca sobrescrever a 2ª.
  const abortRef = useRef<AbortController | null>(null);
  // /retrieve não tem AbortController (a Mapbox não define request in-flight cancelável aqui) —
  // este contador é quem garante que uma seleção anterior, ainda em voo, nunca sobrescreva o
  // resultado de uma seleção mais nova (E46: clique duplo ou Enter rápido em duas sugestões).
  const selectionSeqRef = useRef(0);

  const runSuggest = useCallback((term: string) => {
    if (!token) return;
    // E38: 429 recente — não tenta de novo a cada tecla, espera o backoff passar.
    if (state.rateLimitedUntil && Date.now() < state.rateLimitedUntil) return;
    // E37: guarda de custo — mês estourou o teto, fica em silêncio (quem usa cai no /forward).
    if (!isSearchBudgetOk()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'SUGGEST_START' });
    const session = getSearchSession(sessionSource);
    noteSuggestCall();
    suggestPlaces(term, token, { session, proximity, signal: controller.signal, types }).then((result) => {
      // Resposta de uma consulta abortada nunca vira estado — nem sucesso, nem erro.
      if (controller.signal.aborted) return;
      if (result.ok) {
        dispatch({ type: 'SUGGEST_SUCCESS', suggestions: result.suggestions });
      } else if (result.kind !== 'aborted') {
        const rateLimitedUntil = result.kind === 'rate_limited' ? Date.now() + RATE_LIMIT_BACKOFF_MS : undefined;
        dispatch({ type: 'SUGGEST_ERROR', kind: result.kind, rateLimitedUntil });
      }
    });
  }, [token, proximity, types, sessionSource, state.rateLimitedUntil]);

  useEffect(() => {
    if (!enabled || !token) return;
    const term = state.query.trim();
    if (term.length < MIN_QUERY_LENGTH) return;
    // Debounce por timer: cada tecla nova reexecuta o effect, e o cleanup abaixo cancela o
    // timer da tecla anterior antes dele disparar — digitação contínua nunca acumula timers,
    // só o último dispara request.
    const timer = setTimeout(() => { runSuggest(term); }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); };
  }, [state.query, enabled, token, proximity, runSuggest]);

  // Aborta a consulta em voo se o componente desmontar.
  useEffect(() => () => abortRef.current?.abort(), []);

  const setQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_QUERY', query });
  }, []);

  const select = useCallback(async (index: number): Promise<GeoSearchPlace | null> => {
    const suggestion = state.suggestions[index];
    if (!suggestion || !token) return null;
    const seq = ++selectionSeqRef.current;
    dispatch({ type: 'RETRIEVE_START', id: suggestion.id });
    const session = getSearchSession(sessionSource);
    noteRetrieveCall();
    const place = await retrievePlace(suggestion.id, token, { session });
    // Uma seleção mais nova já começou enquanto esta estava em voo (E46) — sem isso o resultado
    // desta, mesmo sem nenhum AbortController, podia chegar depois e virar estado / ser aplicado
    // por quem usa por cima da escolha mais recente do operador.
    if (seq !== selectionSeqRef.current) return null;
    if (place) {
      dispatch({ type: 'RETRIEVE_END' });
    } else {
      // retrievePlace() só devolve null, sem causa — 'not_found' é o kind mais próximo de "sem
      // coordenada válida", que é a própria doc do mapboxGeocode.ts pra esse retorno.
      dispatch({ type: 'RETRIEVE_ERROR', kind: 'not_found' });
    }
    // O /retrieve em si já fecha a sessão pro billing da Mapbox, sucesso ou falha — não é o
    // resultado que decide isso.
    endSearchSession();
    return place;
  }, [state.suggestions, token, sessionSource]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    // E46: sem isso, fechar o picker (ou apertar Esc) sem escolher nada deixava a sessão aberta —
    // a próxima busca, mesmo sobre um endereço completamente diferente, reaproveitava o mesmo
    // session_token dentro da janela de 2 min (SESSION_IDLE_MS em mapboxSession.ts).
    endSearchSession();
    dispatch({ type: 'CLEAR' });
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    const lastIndex = state.suggestions.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        if (lastIndex < 0) return;
        event.preventDefault();
        dispatch({ type: 'HIGHLIGHT', index: Math.min(state.highlightedIndex + 1, lastIndex) });
        return;
      case 'ArrowUp':
        if (lastIndex < 0) return;
        event.preventDefault();
        dispatch({ type: 'HIGHLIGHT', index: Math.max(state.highlightedIndex - 1, 0) });
        return;
      case 'Home':
        if (lastIndex < 0) return;
        event.preventDefault();
        dispatch({ type: 'HIGHLIGHT', index: 0 });
        return;
      case 'End':
        if (lastIndex < 0) return;
        event.preventDefault();
        dispatch({ type: 'HIGHLIGHT', index: lastIndex });
        return;
      case 'Enter':
        // Sem item destacado o hook não decide nada — quem usa cai na busca antiga (/forward).
        // Com item destacado, só previne o padrão: quem usa é que chama select(highlightedIndex)
        // (E46 — antes o hook chamava select() aqui dentro e descartava o resultado com `void`,
        // então uma seleção por Enter nunca chegava a aplicar a localização no picker).
        if (state.highlightedIndex < 0 || state.highlightedIndex > lastIndex) return;
        event.preventDefault();
        return;
      case 'Escape':
        event.preventDefault();
        clear();
        return;
      default:
        return;
    }
  }, [state.suggestions.length, state.highlightedIndex, clear]);

  return {
    query: state.query,
    setQuery,
    suggestions: state.suggestions,
    isLoading: state.isLoading,
    error: state.error,
    highlightedIndex: state.highlightedIndex,
    retrievingId: state.retrievingId,
    select,
    onKeyDown,
    clear,
  };
}
