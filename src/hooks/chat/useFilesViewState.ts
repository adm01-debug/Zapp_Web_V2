import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';
import type { ContactMediaKind } from '@/hooks/chat/useContactMedia';

/**
 * Estado de visualizacao da aba Arquivos (etapa 06 do plano de 50 etapas).
 *
 * Duas camadas com ciclos de vida diferentes, de proposito:
 * - `viewMode`/`columns` sao preferencia do operador -> `localStorage`, com sufixo do
 *   usuario (convencao da casa: `zapp.<area>.<pref>`), sanitizada na leitura.
 * - `sort`/`typeFilter`/`search` sao contexto da conversa -> memoria da sessao, num `Map`
 *   por `<userId>:<contactId>`, para sair ao Chat e voltar a Arquivos sem perder o recorte.
 *   Recarregar a pagina zera; trocar de contato ou de usuario comeca limpo.
 *
 * A selecao (etapa 08) nunca entra aqui: nao e recorte de tela, e escolha do operador.
 */

export type FilesViewMode = 'grid' | 'list' | 'table';
export type FilesSort = 'recent' | 'old' | 'biggest' | 'alpha';
export type FilesTypeFilter = 'all' | ContactMediaKind;

export const FILES_COLUMNS = [3, 4, 5, 6, 8] as const;
export type FilesColumns = (typeof FILES_COLUMNS)[number];

export const VIEW_MODES: readonly FilesViewMode[] = ['grid', 'list', 'table'];
export const FILES_SORTS: readonly FilesSort[] = ['recent', 'old', 'biggest', 'alpha'];

/** D3 (01/10): 4 colunas e o default por caber com todas as laterais abertas. */
export const DEFAULT_FILES_VIEW_PREFS: FilesViewPrefs = { viewMode: 'grid', columns: 4 };

const PREFS_VERSION = 1;

export interface FilesViewPrefs {
  viewMode: FilesViewMode;
  columns: FilesColumns;
}

export interface FilesViewSession {
  sort: FilesSort;
  typeFilter: FilesTypeFilter;
  search: string;
}

export const DEFAULT_FILES_VIEW_SESSION: FilesViewSession = {
  sort: 'recent',
  typeFilter: 'all',
  search: '',
};

export function filesViewStorageKey(userId: string): string {
  return `zapp.inbox.files.view:${userId}`;
}

export function filesViewSessionKey(userId: string, contactId: string): string {
  return `${userId}:${contactId}`;
}

function isViewMode(value: unknown): value is FilesViewMode {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value);
}

function isColumns(value: unknown): value is FilesColumns {
  return typeof value === 'number' && (FILES_COLUMNS as readonly number[]).includes(value);
}

/**
 * Leitura defensiva: valor fora do dominio, versao desconhecida ou JSON quebrado caem
 * no default. Nunca lanca - a indisponibilidade do storage nao pode quebrar a aba.
 */
export function parseFilesViewPrefs(raw: unknown): FilesViewPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_FILES_VIEW_PREFS;
  const candidate = raw as { v?: unknown; viewMode?: unknown; columns?: unknown };
  if (candidate.v !== PREFS_VERSION) return DEFAULT_FILES_VIEW_PREFS;
  return {
    viewMode: isViewMode(candidate.viewMode) ? candidate.viewMode : DEFAULT_FILES_VIEW_PREFS.viewMode,
    columns: isColumns(candidate.columns) ? candidate.columns : DEFAULT_FILES_VIEW_PREFS.columns,
  };
}

function readPrefs(userId: string | null | undefined): FilesViewPrefs {
  if (!userId) return DEFAULT_FILES_VIEW_PREFS;
  return parseFilesViewPrefs(safeGetJSON<unknown>(filesViewStorageKey(userId), null));
}

function writePrefs(userId: string | null | undefined, prefs: FilesViewPrefs): void {
  if (!userId) return;
  safeSetJSON(filesViewStorageKey(userId), { v: PREFS_VERSION, ...prefs });
}

const sessionCache = new Map<string, FilesViewSession>();

/** Esvaziado no `SIGNED_OUT`: o logout limpa React Query e caches offline, mas nao enxerga este Map. */
export function clearFilesViewSessionCache(): void {
  sessionCache.clear();
}

export function readFilesViewSession(key: string | null): FilesViewSession {
  if (!key) return DEFAULT_FILES_VIEW_SESSION;
  return sessionCache.get(key) ?? DEFAULT_FILES_VIEW_SESSION;
}

export function writeFilesViewSession(key: string | null, session: FilesViewSession): void {
  if (!key) return;
  sessionCache.set(key, session);
}

interface FilesViewState {
  viewMode: FilesViewMode;
  columns: FilesColumns;
  sort: FilesSort;
  typeFilter: FilesTypeFilter;
  search: string;
  setViewMode: (mode: FilesViewMode) => void;
  setColumns: (columns: FilesColumns) => void;
  setSort: (sort: FilesSort) => void;
  setTypeFilter: (filter: FilesTypeFilter) => void;
  setSearch: (search: string) => void;
}

interface InternalState {
  key: string;
  prefs: FilesViewPrefs;
  session: FilesViewSession;
}

function initialState(userId: string | null | undefined, contactId: string | null | undefined): InternalState {
  const key = userId && contactId ? filesViewSessionKey(userId, contactId) : '';
  return {
    key: `${key}|${userId ?? ''}`,
    prefs: readPrefs(userId),
    session: readFilesViewSession(key || null),
  };
}

export function useFilesViewState(
  userId: string | null | undefined,
  contactId: string | null | undefined,
): FilesViewState {
  const [state, setState] = useState<InternalState>(() => initialState(userId, contactId));
  const sessionKey = userId && contactId ? filesViewSessionKey(userId, contactId) : null;

  // Reset durante o render (padrao do React para "estado derivado de props"): trocar de
  // contato ou de usuario recomeca do default, sem efeito em cascata.
  const expectedKey = `${sessionKey ?? ''}|${userId ?? ''}`;
  if (state.key !== expectedKey) {
    setState(initialState(userId, contactId));
  }

  useEffect(() => {
    writeFilesViewSession(sessionKey, state.session);
  }, [sessionKey, state.session]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clearFilesViewSessionCache();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const mergePrefs = useCallback(
    (patch: Partial<FilesViewPrefs>) => {
      setState((current) => {
        const prefs = { ...current.prefs, ...patch };
        writePrefs(userId, prefs);
        return { ...current, prefs };
      });
    },
    [userId],
  );

  const mergeSession = useCallback((patch: Partial<FilesViewSession>) => {
    setState((current) => ({ ...current, session: { ...current.session, ...patch } }));
  }, []);

  return {
    viewMode: state.prefs.viewMode,
    columns: state.prefs.columns,
    sort: state.session.sort,
    typeFilter: state.session.typeFilter,
    search: state.session.search,
    setViewMode: useCallback((mode: FilesViewMode) => mergePrefs({ viewMode: mode }), [mergePrefs]),
    setColumns: useCallback((columns: FilesColumns) => mergePrefs({ columns }), [mergePrefs]),
    setSort: useCallback((sort: FilesSort) => mergeSession({ sort }), [mergeSession]),
    setTypeFilter: useCallback((typeFilter: FilesTypeFilter) => mergeSession({ typeFilter }), [mergeSession]),
    setSearch: useCallback((search: string) => mergeSession({ search }), [mergeSession]),
  };
}
