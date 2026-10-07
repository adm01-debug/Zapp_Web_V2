import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react';

export interface NavigationEntry {
  /**
   * Identidade da entrada, gravada em `window.history.state[NAV_STATE_KEY]`.
   * É o que permite reconciliar a travessia do navegador com a OCORRÊNCIA certa
   * quando a mesma view aparece mais de uma vez no histórico (ex.: A,B,C,B,D).
   */
  id: string;
  viewId: string;
  timestamp: number;
}

interface NavigationState {
  entries: NavigationEntry[];
  index: number;
  previousView: string | null;
}

interface NavigationHistoryReturn {
  currentView: string;
  navigateTo: (viewId: string) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Breadcrumb trail (last N entries, deduplicated consecutive) */
  breadcrumbTrail: string[];
  /** Previous view id (for transition direction) */
  previousView: string | null;
  /** Full history stack */
  history: NavigationEntry[];
}

const MAX_HISTORY = 50;
const BREADCRUMB_DEPTH = 4;

/** Chave de `window.history.state` que guarda a identidade da entrada. */
const NAV_STATE_KEY = 'zappNavId';

let navEntrySeq = 0;

/** Gera uma identidade única para a entrada (contador + tempo). */
function createEntryId(): string {
  navEntrySeq += 1;
  return `nav-${Date.now().toString(36)}-${navEntrySeq}`;
}

/** Lê a identidade da entrada a partir de um `history.state`. */
function readEntryId(state: unknown): string | null {
  if (state && typeof state === 'object') {
    const id = (state as Record<string, unknown>)[NAV_STATE_KEY];
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

/**
 * Grava a identidade na entrada ATUAL do navegador sem tocar na URL. Usado
 * quando a entrada foi criada fora do hook (ex.: `history.pushState` de outro
 * provider) ou na carga inicial, para que ela também seja reconhecível.
 */
function bindEntryIdentity(entryId: string): void {
  const base = window.history.state && typeof window.history.state === 'object'
    ? (window.history.state as Record<string, unknown>)
    : {};
  window.history.replaceState({ ...base, [NAV_STATE_KEY]: entryId }, '', window.location.href);
}

/** Reconcilia a identidade recebida do navegador com a entrada correspondente. */
function reconcileById(prev: NavigationState, entryId: string): NavigationState | null {
  const idx = prev.entries.findIndex(entry => entry.id === entryId);
  if (idx < 0) return null;
  if (idx === prev.index) return prev;
  return { ...prev, index: idx, previousView: prev.entries[prev.index]?.viewId ?? null };
}

/** Empilha a entrada a partir da posição atual, descartando o ramo seguinte. */
function pushEntry(prev: NavigationState, entry: NavigationEntry): NavigationState {
  const currentViewId = prev.entries[prev.index]?.viewId ?? null;
  const truncated = prev.entries.slice(0, prev.index + 1);
  const newEntries = [...truncated, entry].slice(-MAX_HISTORY);
  return { entries: newEntries, index: newEntries.length - 1, previousView: currentViewId };
}

// Hashes that are NOT view IDs (e.g. skip-to-content anchors)
export const RESERVED_HASHES = new Set(['main-content', 'main-navigation', 'inbox-section', 'search-input']);

/**
 * Compatibilidade de rota (TRA-010/#178): ids de módulos REMOVIDOS que ainda
 * podem viver em favorito, histórico ou link compartilhado. O id antigo resolve
 * para a tela vigente equivalente em vez de cair no fallback do ViewRouter.
 * `tags` → `contacts` (o modelo de etiqueta vigente é `contacts.tags`).
 */
export const LEGACY_VIEW_REDIRECTS: Readonly<Record<string, string>> = Object.freeze({
  tags: 'contacts',
});

/** Resolve um id de view legado para a tela vigente (id desconhecido passa reto). */
export function resolveLegacyView(viewId: string): string {
  return LEGACY_VIEW_REDIRECTS[viewId] ?? viewId;
}

/**
 * Reads the active view from the URL.
 * Canonical format: ?view=<id>
 * Legacy compat: #<id> (hash) — migrated to ?view= on first load.
 * Ids de módulos removidos passam por `resolveLegacyView`.
 */
function getViewFromUrl(defaultView: string): string {
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view');
  if (viewParam) return resolveLegacyView(viewParam);

  // Backward compat: hash-based deep links ("#inbox") before migration
  const hash = window.location.hash.replace('#', '');
  if (hash && !RESERVED_HASHES.has(hash)) return resolveLegacyView(hash);

  return defaultView;
}

/**
 * Writes the canonical view to the URL (?view=<id>), preserving skip-to-content
 * anchors. Single source of the URL rules: the hook and every non-hook call site
 * go through here, so the reserved-hash semantics cannot drift between them.
 */
export function setViewParam(view: string, replace = false, entryId?: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('view', view);
  if (url.hash && !RESERVED_HASHES.has(url.hash.replace('#', ''))) {
    url.hash = '';
  }
  const base = window.history.state && typeof window.history.state === 'object'
    ? (window.history.state as Record<string, unknown>)
    : {};
  const state = entryId
    ? { ...base, [NAV_STATE_KEY]: entryId }
    : (replace ? window.history.state : null);
  if (replace) {
    window.history.replaceState(state, '', url.href);
  } else {
    window.history.pushState(state, '', url.href);
  }
}

/**
 * Shared navigation helper for non-hook call sites (GlobalSearch, ContactActionButtons, etc.).
 * Updates the URL and dispatches a custom event so the hook pushes a new history entry
 * without a synthetic popstate being misinterpreted as browser back/forward traversal.
 *
 * Always calls setViewParam — when the view is already active it passes replace=true so
 * any stale non-reserved hash is cleaned via replaceState without adding a history entry.
 */
export function navigateToView(view: string): void {
  const currentView = new URLSearchParams(window.location.search).get('view');
  const replace = currentView === view;
  // Só gera identidade quando empilha entrada nova: um replace (view já ativa)
  // não deve marcador — a entrada atual continua com a identidade dela.
  const entryId = replace ? undefined : createEntryId();
  setViewParam(view, replace, entryId);
  window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view, entryId } }));
}

/**
 * Navigation history with back/forward stacks, breadcrumb trail,
 * and URL query-param sync (?view=<id>) for deep linking.
 *
 * Canonical URL format: ?view=<viewId>
 * Legacy hash URLs (#<viewId>) are migrated to ?view= on first load.
 *
 * Uses a single state atom for history+index to prevent race conditions
 * between separate setState calls.
 */
export function useNavigationHistory(defaultView = 'inbox'): NavigationHistoryReturn {
  const [state, setState] = useState<NavigationState>(() => ({
    entries: [{ id: createEntryId(), viewId: getViewFromUrl(defaultView), timestamp: Date.now() }],
    index: 0,
    previousView: null,
  }));

  // Ref mirrors last-rendered state so URL sync in callbacks can read current
  // history without adding state to dependency arrays (which would regenerate
  // memoized callbacks on every navigation). useLayoutEffect (not useEffect)
  // runs synchronously before paint, closing the window where stateRef would
  // be stale if goBack/goForward fired between DOM commit and effect.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const currentView = state.entries[state.index]?.viewId ?? defaultView;

  // Sync ?view= → state on browser back/forward. NOTA: pushState/replaceState NÃO
  // disparam popstate — navegação programática emite `zapp:navigate` (veja syncView).
  const onPopState = useCallback((event?: Event) => {
    const viewId = getViewFromUrl(defaultView);
    // Identidade da entrada para onde o navegador foi. Sem `event` (ex.: hashchange)
    // não há travessia a reconciliar — cai no caminho por view.
    const targetId = event ? readEntryId((event as PopStateEvent).state) : null;
    const fallbackId = createEntryId();

    setState(prev => {
      const currentViewId = prev.entries[prev.index]?.viewId;

      // 1) Reconciliar pela identidade da entrada: distingue duas ocorrências da
      //    MESMA view (ex.: A,B,C,B,D — avançar de C para o B posterior é o índice 3,
      //    não o índice 1). É o que o navegador realmente informa em `event.state`.
      if (targetId) {
        const reconciled = reconcileById(prev, targetId);
        if (reconciled) return reconciled;
      }

      if (viewId === currentViewId) return prev;
      // 2) Entrada estrangeira (sem identidade conhecida): procura para trás...
      for (let i = prev.index - 1; i >= 0; i--) {
        if (prev.entries[i].viewId === viewId) {
          return { ...prev, index: i, previousView: currentViewId ?? null };
        }
      }
      // ...e para frente.
      for (let i = prev.index + 1; i < prev.entries.length; i++) {
        if (prev.entries[i].viewId === viewId) {
          return { ...prev, index: i, previousView: currentViewId ?? null };
        }
      }
      // 3) Address bar / deep link → push new entry
      const newEntry: NavigationEntry = { id: fallbackId, viewId, timestamp: Date.now() };
      return pushEntry(prev, newEntry);
    });
  }, [defaultView]);

  // Always push a new entry for zapp:navigate — never treated as back/forward traversal.
  // Quando o emissor informa a identidade da entrada (syncView/navigateToView), a
  // entrada é a MESMA nas instâncias paralelas: se ela já existe aqui, reconcilia
  // em vez de empilhar de novo.
  const onZappNavigate = useCallback((e: Event) => {
    const detail = (e as CustomEvent<{ view?: string; entryId?: string }>).detail;
    const view = detail?.view;
    if (!view) return;
    const entryId = detail?.entryId ?? createEntryId();
    setState(prev => {
      const currentViewId = prev.entries[prev.index]?.viewId;
      const reconciled = reconcileById(prev, entryId);
      if (reconciled) return reconciled;
      if (view === currentViewId) return prev;
      const newEntry: NavigationEntry = { id: entryId, viewId: view, timestamp: Date.now() };
      return pushEntry(prev, newEntry);
    });
  }, []);

  // Migration bridge: legacy code (e.g. GlobalSearch, ContactsCRUD) may still write
  // window.location.hash = '#inbox'. Intercept hashchange, migrate URL to ?view=, and handle.
  const onHashChange = useCallback(() => {
    const hash = window.location.hash.replace('#', '');
    if (RESERVED_HASHES.has(hash)) return;
    if (!hash) {
      // Empty hash after hashchange (e.g. back to URL without anchor) — re-sync view from ?view=
      onPopState();
      return;
    }

    // Migrate the URL: replace hash with ?view= query param
    setViewParam(resolveLegacyView(hash), true);

    // Handle as a view change using the same logic as onPopState
    onPopState();
  }, [onPopState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Compatibilidade de rota (TRA-010/#178): favorito/link antigo de módulo
    // removido (?view=tags) é reescrito para a tela vigente SEM empilhar
    // histórico — a URL fica coerente e o redirect não passa pelo fallback.
    const rawView = params.get('view');
    if (rawView) {
      const resolved = resolveLegacyView(rawView);
      if (resolved !== rawView) setViewParam(resolved, true);
    }
    // One-time migration: if URL still uses hash (#inbox) with no ?view=, rewrite to ?view=inbox
    const hash = window.location.hash.replace('#', '');
    if (hash && !RESERVED_HASHES.has(hash) && !params.get('view')) {
      setViewParam(resolveLegacyView(hash), true);
    }

    // Vincula a identidade da entrada atual do navegador à entrada do histórico
    // interno — inclusive após recarregar (o mapa em memória se refez, mas a
    // travessia do navegador continua reconhecível).
    const currentEntryId = stateRef.current.entries[stateRef.current.index]?.id;
    if (currentEntryId) bindEntryIdentity(currentEntryId);

    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('zapp:navigate', onZappNavigate);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('zapp:navigate', onZappNavigate);
    };
  }, [onPopState, onHashChange, onZappNavigate]);

  const syncView = useCallback((viewId: string, replace = false, entryId?: string) => {
    setViewParam(viewId, replace, entryId);
    // Fonte única de navegação: navigateTo/goBack/goForward emitem o evento,
    // para que instâncias paralelas do hook (ActiveCallBar) acompanhem a view.
    window.dispatchEvent(new CustomEvent('zapp:navigate', { detail: { view: viewId, entryId } }));
  }, []);

  const navigateTo = useCallback((viewId: string) => {
    // Read current view from URL (updated synchronously by setViewParam) rather than stateRef,
    // which may be stale when goBack() + navigateTo() fire in the same synchronous tick.
    const currentViewId = new URLSearchParams(window.location.search).get('view') ?? defaultView;
    if (currentViewId === viewId) return;
    const entryId = createEntryId();
    setState(prev => {
      const cvid = prev.entries[prev.index]?.viewId;
      if (viewId === cvid) return prev;
      const newEntry: NavigationEntry = { id: entryId, viewId, timestamp: Date.now() };
      return pushEntry(prev, newEntry);
    });
    syncView(viewId, false, entryId);
  }, [syncView, defaultView]);

  const goBack = useCallback(() => {
    const { entries, index } = stateRef.current;
    if (index <= 0) return;
    const target = entries[index - 1];
    if (!target) return;
    setState(prev => {
      if (prev.index <= 0) return prev;
      const newIndex = prev.index - 1;
      return { ...prev, index: newIndex, previousView: prev.entries[prev.index]?.viewId ?? null };
    });
    // replace=true: a entrada ATUAL do navegador passa a representar a entrada de
    // destino (mesma identidade), então voltar/avançar do navegador reconcile-a.
    syncView(target.viewId, true, target.id);
  }, [syncView]);

  const goForward = useCallback(() => {
    const { entries, index } = stateRef.current;
    if (index >= entries.length - 1) return;
    const target = entries[index + 1];
    if (!target) return;
    setState(prev => {
      if (prev.index >= prev.entries.length - 1) return prev;
      const newIndex = prev.index + 1;
      return { ...prev, index: newIndex, previousView: prev.entries[prev.index]?.viewId ?? null };
    });
    syncView(target.viewId, true, target.id);
  }, [syncView]);

  const canGoBack = state.index > 0;
  const canGoForward = state.index < state.entries.length - 1;

  const breadcrumbTrail = useMemo(() => {
    const trail: string[] = [];
    for (let i = state.index; i >= 0 && trail.length < BREADCRUMB_DEPTH; i--) {
      const entry = state.entries[i];
      if (!entry) break;
      const viewId = entry.viewId;
      if (trail.length === 0 || trail[trail.length - 1] !== viewId) {
        trail.push(viewId);
      }
    }
    return trail.reverse();
  }, [state.entries, state.index]);

  return {
    currentView,
    navigateTo,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    breadcrumbTrail,
    previousView: state.previousView,
    history: state.entries,
  };
}
