import { useCallback, useEffect, useReducer, useRef } from 'react';
import { suggestPlaces } from '@/lib/mapboxGeocode';
import type { GeoSuggestion, GeoFailureKind, GeoProximity } from '@/lib/mapboxGeocode';
import { getSearchSession, noteSuggestCall } from '@/lib/mapboxSession';

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
}

interface State {
  query: string;
  suggestions: GeoSuggestion[];
  isLoading: boolean;
  error: GeoFailureKind | null;
  highlightedIndex: number;
}

const initialState: State = {
  query: '',
  suggestions: [],
  isLoading: false,
  error: null,
  highlightedIndex: -1,
};

type Action =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SUGGEST_START' }
  | { type: 'SUGGEST_SUCCESS'; suggestions: GeoSuggestion[] }
  | { type: 'SUGGEST_ERROR'; kind: GeoFailureKind };

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

  return {
    query: state.query,
    setQuery,
    suggestions: state.suggestions,
    isLoading: state.isLoading,
    error: state.error,
    highlightedIndex: state.highlightedIndex,
  };
}
