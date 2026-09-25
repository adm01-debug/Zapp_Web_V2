import { useCallback, useEffect, useReducer, useRef } from 'react';
import { suggestPlaces, retrievePlace } from '@/lib/mapboxGeocode';
import type { GeoSuggestion, GeoFailureKind, GeoProximity, GeoSearchPlace } from '@/lib/mapboxGeocode';
import { getSearchSession, noteSuggestCall, noteRetrieveCall, endSearchSession } from '@/lib/mapboxSession';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

export interface UseAddressAutocompleteOptions {
  token: string | null;
  proximity?: GeoProximity;
  enabled: boolean;
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
}

interface State {
  query: string;
  suggestions: GeoSuggestion[];
  isLoading: boolean;
  error: GeoFailureKind | null;
  highlightedIndex: number;
  retrievingId: string | null;
}

const initialState: State = {
  query: '',
  suggestions: [],
  isLoading: false,
  error: null,
  highlightedIndex: -1,
  retrievingId: null,
};

type Action =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SUGGEST_START' }
  | { type: 'SUGGEST_SUCCESS'; suggestions: GeoSuggestion[] }
  | { type: 'SUGGEST_ERROR'; kind: GeoFailureKind }
  | { type: 'RETRIEVE_START'; id: string }
  | { type: 'RETRIEVE_END' }
  | { type: 'RETRIEVE_ERROR'; kind: GeoFailureKind };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.query, error: null };
    case 'SUGGEST_START':
      return { ...state, isLoading: true, error: null };
    case 'SUGGEST_SUCCESS':
      return { ...state, isLoading: false, error: null, suggestions: action.suggestions, highlightedIndex: -1 };
    case 'SUGGEST_ERROR':
      return { ...state, isLoading: false, error: action.kind, suggestions: [] };
    case 'RETRIEVE_START':
      // Falha de retrieve não fecha a lista: só o item some do estado de carregamento
      // (RETRIEVE_END), as sugestões continuam de pé.
      return { ...state, retrievingId: action.id, error: null };
    case 'RETRIEVE_END':
      return { ...state, retrievingId: null };
    case 'RETRIEVE_ERROR':
      // Falha do /retrieve nunca fecha a lista — só marca a causa; as sugestões continuam de pé.
      return { ...state, retrievingId: null, error: action.kind };
    default:
      return state;
  }
}

/**
 * Autocomplete estilo playground da Mapbox (`/suggest` enquanto digita). Base do hook — Fase 2,
 * E13: debounce, piso de caracteres, cancelamento, seleção/retrieve e teclado chegam nas próximas
 * etapas deste mesmo arquivo. Não sabe de UI nem de feature flag: só trabalha quando `enabled`.
 */
export function useAddressAutocomplete(options: UseAddressAutocompleteOptions): UseAddressAutocompleteResult {
  const { token, proximity, enabled } = options;
  const [state, dispatch] = useReducer(reducer, initialState);
  // Consulta corrente do /suggest: aborta a anterior antes de abrir uma nova, pra resposta
  // lenta da 1ª nunca sobrescrever a 2ª.
  const abortRef = useRef<AbortController | null>(null);

  const runSuggest = useCallback((term: string) => {
    if (!token) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'SUGGEST_START' });
    const session = getSearchSession();
    noteSuggestCall();
    suggestPlaces(term, token, { session, proximity, signal: controller.signal }).then((result) => {
      // Resposta de uma consulta abortada nunca vira estado — nem sucesso, nem erro.
      if (controller.signal.aborted) return;
      if (result.ok) {
        dispatch({ type: 'SUGGEST_SUCCESS', suggestions: result.suggestions });
      } else if (result.kind !== 'aborted') {
        dispatch({ type: 'SUGGEST_ERROR', kind: result.kind });
      }
    });
  }, [token, proximity]);

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
    dispatch({ type: 'RETRIEVE_START', id: suggestion.id });
    const session = getSearchSession();
    noteRetrieveCall();
    const place = await retrievePlace(suggestion.id, token, { session });
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
  }, [state.suggestions, token]);

  return {
    query: state.query,
    setQuery,
    suggestions: state.suggestions,
    isLoading: state.isLoading,
    error: state.error,
    highlightedIndex: state.highlightedIndex,
    retrievingId: state.retrievingId,
    select,
  };
}
