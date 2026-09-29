import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { suggestPlaces, retrievePlaceResult, searchPlaces } from '@/lib/mapboxGeocode';
import type { GeoSuggestion, GeoFailureKind, GeoProximity, GeoSearchPlace } from '@/lib/mapboxGeocode';
import { getSearchSession, noteSuggestCall, noteRetrieveCall, endSearchSession } from '@/lib/mapboxSession';
import { isSearchBudgetOk } from '@/lib/mapboxCostGuard';
import { reportMapboxFailure } from '@/lib/mapboxToken';
import type { MapboxFailureKind } from '@/lib/mapboxToken';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;
const RATE_LIMIT_BACKOFF_MS = 60_000;

/**
 * F2/E15: causas de falha do `/suggest` que são **rota quebrada** (não limite de uso) e por isso
 * caem no `/forward`. `rate_limited` (429) e guarda de custo ficam de fora: são limite, não rota —
 * o caminho é esperar/degradar com aviso (E27), não trocar de endpoint.
 */
const FORWARD_FALLBACK_KINDS = new Set<GeoFailureKind>(['network', 'timeout', 'http']);

/**
 * F2/E17 · E51: tradução da causa do geocoding para a taxonomia de falha do mapa. Só o que é
 * falha de ROTA entra aqui — `not_found` (a busca respondeu, só não achou) e `aborted` (consulta
 * cancelada por outra mais nova) não são falha e não geram `client_error`.
 */
const MAPBOX_FAILURE_KIND: Partial<Record<GeoFailureKind, MapboxFailureKind>> = {
  network: 'network',
  timeout: 'timeout',
  http: 'server_error',
  rate_limited: 'rate_limited',
};

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
  /**
   * F2/E13: nova tentativa **real** — dispara a busca na hora (sem esperar o debounce), reusa o
   * termo atual e respeita backoff/custo. Quando está bloqueado (429 ou teto do mês) não faz
   * request nenhum e marca `blocked` (o aviso único é renderizado pelo E27), em vez de deixar a
   * tela dizer "Nada encontrado".
   */
  retrySuggest: () => void;
  /** Por que a busca está pausada agora: `rate_limited` (429), `cost_guard` (teto do mês) ou `null`. */
  blocked: 'rate_limited' | 'cost_guard' | null;
  /** E23: estado explícito da busca (`idle | typing | loading | ok | empty | error | paused`). */
  status: SearchStatus;
  /** E27: até quando a busca fica pausada (usado no aviso com contagem regressiva). */
  pausedUntil: number | null;
  /** E26: falha do `/retrieve` amarrada ao item que o operador escolheu. */
  retrieveError: { id: string; kind: GeoFailureKind } | null;
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
  /** E13: cada retry incrementa — entra nas deps do effect de busca para reexecutar a consulta. */
  attempt: number;
  /** E13/E27: bloqueio vigente (429 ou guarda de custo), separado de "nenhum resultado". */
  blocked: 'rate_limited' | 'cost_guard' | null;
  /** E23: estado explícito da busca — quem renderiza não infere nada por `suggestions.length`. */
  status: SearchStatus;
  /** E26: causa da falha do `/retrieve` amarrada ao item escolhido (não é erro da lista). */
  retrieveError: { id: string; kind: GeoFailureKind } | null;
}

const initialState: State = {
  query: '',
  suggestions: [],
  isLoading: false,
  error: null,
  highlightedIndex: -1,
  retrievingId: null,
  rateLimitedUntil: null,
  attempt: 0,
  blocked: null,
  status: 'idle',
  retrieveError: null,
};

type Action =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SUGGEST_START' }
  | { type: 'SUGGEST_SUCCESS'; suggestions: GeoSuggestion[] }
  | { type: 'SUGGEST_ERROR'; kind: GeoFailureKind; rateLimitedUntil?: number }
  | { type: 'SUGGEST_BLOCKED'; reason: 'rate_limited' | 'cost_guard'; rateLimitedUntil?: number }
  | { type: 'RETRY' }
  | { type: 'RETRIEVE_START'; id: string }
  | { type: 'RETRIEVE_END' }
  | { type: 'RETRIEVE_ERROR'; id: string; kind: GeoFailureKind }
  | { type: 'HIGHLIGHT'; index: number }
  | { type: 'CLEAR' };

/**
 * E23: estado da busca como uma coisa só, em vez de "quem chama adivinha pela lista".
 * `empty` só existe depois de uma resposta 200 sem resultado; `typing` é o debounce; `paused`
 * é limite de uso (429 / teto do mês). Com isso a UI nunca mais escreve "Nada encontrado" em
 * cima de uma falha ou de uma pausa (C6/E25).
 */
export type SearchStatus = 'idle' | 'typing' | 'loading' | 'ok' | 'empty' | 'error' | 'paused';

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_QUERY': {
      const belowMin = action.query.trim().length < MIN_QUERY_LENGTH;
      return {
        ...state,
        query: action.query,
        // E27 (item 2): enquanto a busca está pausada, digitar não apaga o aviso — é justamente
        // ele que explica por que não há sugestões. Fora da pausa, a tecla nova limpa o erro.
        error: state.blocked ? state.error : null,
        retrieveError: null,
        ...(belowMin
          ? { suggestions: [], isLoading: false, highlightedIndex: -1 }
          : {}),
        // E27: pausado continua pausado enquanto o bloqueio vale — seja apagando o termo, seja
        // digitando mais. Sem isso a tela cairia num esqueleto que nunca sai (a busca nem vai
        // disparar) ou num "Nada encontrado" que não é verdade.
        status: state.blocked ? ('paused' as const) : belowMin ? ('idle' as const) : ('typing' as const),
      };
    }
    case 'SUGGEST_START':
      return { ...state, isLoading: true, error: null, blocked: null, status: 'loading' };
    case 'SUGGEST_SUCCESS':
      return {
        ...state,
        isLoading: false,
        error: null,
        blocked: null,
        suggestions: action.suggestions,
        highlightedIndex: -1,
        // E23/E25: lista vazia vinda de resposta boa é `empty`; com itens é `ok`.
        status: action.suggestions.length > 0 ? 'ok' : 'empty',
      };
    case 'SUGGEST_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.kind,
        suggestions: [],
        blocked: null,
        status: 'error',
        rateLimitedUntil: action.rateLimitedUntil ?? null,
      };
    case 'SUGGEST_BLOCKED':
      return {
        ...state,
        isLoading: false,
        error: null,
        suggestions: [],
        blocked: action.reason,
        status: 'paused',
        rateLimitedUntil: action.rateLimitedUntil ?? state.rateLimitedUntil,
      };
    case 'RETRY':
      return { ...state, attempt: state.attempt + 1, error: null, retrieveError: null };
    case 'RETRIEVE_START':
      // Falha de retrieve não fecha a lista: só o item some do estado de carregamento
      // (RETRIEVE_END), as sugestões continuam de pé.
      return { ...state, retrievingId: action.id, retrieveError: null };
    case 'RETRIEVE_END':
      return { ...state, retrievingId: null };
    case 'RETRIEVE_ERROR':
      // E26: a falha do `/retrieve` fica presa ao ITEM que o operador escolheu (antes ela virava
      // o erro da lista inteira, e o aviso "Falha ao buscar sugestões" aparecia em cima de uma
      // lista que estava certa) e não fecha a lista.
      return { ...state, retrievingId: null, retrieveError: { id: action.id, kind: action.kind } };
    case 'HIGHLIGHT':
      return { ...state, highlightedIndex: action.index };
    case 'CLEAR':
      return { ...initialState };
    default:
      return state;
  }
}

/**
 * F2/E15: sugestão vinda do `/forward` (fallback quando o `/suggest` cai). O `/forward` não
 * devolve a tipologia do `/suggest` (`feature_type`), então o ícone fica no genérico — o que
 * importa aqui é a coordenada já vir junto (`coords`), que dispensa o `/retrieve` na seleção.
 */
function toForwardSuggestion(place: GeoSearchPlace, index: number): GeoSuggestion {
  return {
    id: `forward-${index}-${place.lat},${place.lng}`,
    name: place.name ?? place.address,
    address: place.address,
    kind: 'other',
    coords: { lat: place.lat, lng: place.lng },
  };
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
  // A3-03 (onda 2): termo da consulta em voo. Sem isto, a resposta do termo ANTERIOR chegava
  // dentro dos 300 ms do debounce do termo novo e pintava a lista de um endereço já trocado.
  const activeTermRef = useRef<string | null>(null);
  // /retrieve não tem AbortController (a Mapbox não define request in-flight cancelável aqui) —
  // este contador é quem garante que uma seleção anterior, ainda em voo, nunca sobrescreva o
  // resultado de uma seleção mais nova (E46: clique duplo ou Enter rápido em duas sugestões).
  const selectionSeqRef = useRef(0);
  // E13: último retry já executado pelo effect — é a comparação que diz "esta mudança veio de um
  // clique em Tentar novamente" (dispara na hora) em vez de uma tecla (respeita o debounce).
  const retryRef = useRef(0);

  const runSuggest = useCallback((term: string) => {
    if (!token) return;
    // E38: 429 recente — não tenta de novo a cada tecla, espera o backoff passar.
    if (state.rateLimitedUntil && Date.now() < state.rateLimitedUntil) return;
    // E37: guarda de custo — mês estourou o teto, fica em silêncio (quem usa cai no /forward).
    if (!isSearchBudgetOk()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // A3-03 (onda 2): registra o termo desta consulta — é o que permite descartar a resposta
    // quando o operador já digitou outra coisa (ver o guard no `.then` abaixo).
    activeTermRef.current = term;
    dispatch({ type: 'SUGGEST_START' });
    const session = getSearchSession(sessionSource);
    noteSuggestCall();
    suggestPlaces(term, token, { session, proximity, signal: controller.signal, types }).then(async (result) => {
      // Resposta de uma consulta abortada nunca vira estado — nem sucesso, nem erro. A3-03: a
      // resposta de um termo que já não é o corrente (janela do debounce de 300 ms) também não.
      if (controller.signal.aborted || activeTermRef.current !== term) return;

      if (!result.ok && FORWARD_FALLBACK_KINDS.has(result.kind)) {
        // F2/E15: `/suggest` caiu por rota — o `/forward` (searchPlaces) é a rede de proteção.
        // Sem isto, `/suggest` fora do ar = busca fora do ar (C3).
        const forward = await searchPlaces(term, token, controller.signal, proximity);
        if (controller.signal.aborted || activeTermRef.current !== term) return;
        if (forward.ok && forward.places.length > 0) {
          dispatch({ type: 'SUGGEST_SUCCESS', suggestions: forward.places.map((place, index) => toForwardSuggestion(place, index)) });
          return;
        }
      }

      if (result.ok) {
        dispatch({ type: 'SUGGEST_SUCCESS', suggestions: result.suggestions });
        return;
      }
      if (result.kind === 'aborted') return;

      if (FORWARD_FALLBACK_KINDS.has(result.kind)) {
        // F2/E17: só aqui os DOIS caminhos falharam na mesma busca — antes disso seria ruído.
        // Sem o termo digitado (E39): a telemetria só leva o tipo da falha.
        const reported = MAPBOX_FAILURE_KIND[result.kind];
        if (reported) reportMapboxFailure(reported, 'suggest');
      }
      const rateLimitedUntil = result.kind === 'rate_limited' ? Date.now() + RATE_LIMIT_BACKOFF_MS : undefined;
      dispatch({ type: 'SUGGEST_ERROR', kind: result.kind, rateLimitedUntil });
    });
  }, [token, proximity, types, sessionSource, state.rateLimitedUntil]);

  useEffect(() => {
    if (!enabled || !token) return;
    const term = state.query.trim();
    if (term.length < MIN_QUERY_LENGTH) return;
    // E13: o retry não passa pelo debounce — esperar 300 ms depois de um clique em "Tentar
    // novamente" é justamente o que a tela não pode fazer; digitação continua com o piso.
    if (state.attempt !== retryRef.current) {
      retryRef.current = state.attempt;
      runSuggest(term);
      return;
    }
    // Debounce por timer: cada tecla nova reexecuta o effect, e o cleanup abaixo cancela o
    // timer da tecla anterior antes dele disparar — digitação contínua nunca acumula timers,
    // só o último dispara request.
    const timer = setTimeout(() => { runSuggest(term); }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); };
  }, [state.query, state.attempt, enabled, token, proximity, runSuggest]);

  // Aborta a consulta em voo se o componente desmontar.
  useEffect(() => () => abortRef.current?.abort(), []);

  // A3-02 (onda 2): trocar de aba desliga o picker (`enabled=false`) — a consulta em voo tem de
  // morrer aqui, e a seleção em voo tem de ser invalidada. Antes só o timer do debounce era
  // cancelado: o request já disparado seguia vivo e voltava a pintar estado depois.
  useEffect(() => {
    if (enabled) return;
    activeTermRef.current = null;
    selectionSeqRef.current += 1;
    abortRef.current?.abort();
  }, [enabled]);

  const setQuery = useCallback((query: string) => {
    // A3-03 (onda 2): o termo mudou — a resposta do termo anterior não pode mais virar estado,
    // mesmo que ainda esteja em voo (o debounce de 300 ms é justamente essa janela).
    activeTermRef.current = null;
    // E28: apagar até menos de 3 caracteres também mata a consulta em voo — sem isso, a resposta
    // do termo antigo chegava depois e repovoava a lista sobre um campo que já está vazio.
    if (query.trim().length < MIN_QUERY_LENGTH) abortRef.current?.abort();
    dispatch({ type: 'SET_QUERY', query });
  }, []);

  const select = useCallback(async (index: number): Promise<GeoSearchPlace | null> => {
    const suggestion = state.suggestions[index];
    if (!suggestion || !token) return null;
    // E15 item 3: sugestão do `/forward` já traz coordenada — sem `/retrieve` e sem gastar sessão.
    if (suggestion.coords) {
      endSearchSession();
      return {
        lat: suggestion.coords.lat,
        lng: suggestion.coords.lng,
        name: suggestion.name,
        address: suggestion.address,
      };
    }
    const seq = ++selectionSeqRef.current;
    dispatch({ type: 'RETRIEVE_START', id: suggestion.id });
    const session = getSearchSession(sessionSource);
    noteRetrieveCall();
    const result = await retrievePlaceResult(suggestion.id, token, { session });
    // Uma seleção mais nova já começou enquanto esta estava em voo (E46) — sem isso o resultado
    // desta, mesmo sem nenhum AbortController, podia chegar depois e virar estado / ser aplicado
    // por quem usa por cima da escolha mais recente do operador.
    if (seq !== selectionSeqRef.current) return null;

    if (result.ok) {
      dispatch({ type: 'RETRIEVE_END' });
      endSearchSession();
      return result.place;
    }

    // E16: `/retrieve` não devolveu coordenada → repete a busca com o texto da própria sugestão
    // no `/forward`. O corte de relevância (`MIN_V5_RELEVANCE`) é aplicado dentro de `searchPlaces`.
    const fallback = await searchPlaces(
      `${suggestion.name} ${suggestion.address}`.trim(),
      token,
      undefined,
      proximity,
    );
    if (seq !== selectionSeqRef.current) return null;
    // O `/retrieve` fecha a sessão para o billing da Mapbox, sucesso ou falha.
    endSearchSession();
    const place = fallback.ok ? fallback.places[0] : undefined;
    if (place) {
      dispatch({ type: 'RETRIEVE_END' });
      return place;
    }

    // E17/E51: telemetria só na dupla falha — e `not_found`/`aborted` não são falha de rota.
    const reported = MAPBOX_FAILURE_KIND[result.kind];
    if (reported) reportMapboxFailure(reported, 'retrieve');
    dispatch({ type: 'RETRIEVE_ERROR', id: suggestion.id, kind: result.kind });
    return null;
  }, [state.suggestions, token, sessionSource, proximity]);

  const retrySuggest = useCallback(() => {
    // E13: bloqueado (429 ou teto do mês) não faz request nem mente "Nada encontrado" — marca o
    // bloqueio, que a tela mostra como aviso único (E27).
    if (state.rateLimitedUntil && Date.now() < state.rateLimitedUntil) {
      dispatch({ type: 'SUGGEST_BLOCKED', reason: 'rate_limited', rateLimitedUntil: state.rateLimitedUntil });
      return;
    }
    if (!isSearchBudgetOk()) {
      dispatch({ type: 'SUGGEST_BLOCKED', reason: 'cost_guard' });
      return;
    }
    dispatch({ type: 'RETRY' });
  }, [state.rateLimitedUntil]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    // A3-05 (onda 2): invalidar a seleção em voo — Esc/Cancelar com um `/retrieve` em curso deixava
    // a resposta chegar depois e ser aplicada por quem usa, sobre uma tela que o operador fechou.
    selectionSeqRef.current += 1;
    activeTermRef.current = null;
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
    retrySuggest,
    blocked: state.blocked,
    status: state.status,
    pausedUntil: state.rateLimitedUntil,
    retrieveError: state.retrieveError,
  };
}
