import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { safeGetItem, safeRemoveItem, safeSetJSON } from '@/lib/safeStorage';

/**
 * HZ2-007 / HZ5-19 — os favoritos da barra lateral pertencem ao USUÁRIO, não ao
 * navegador. A chave antiga (`sidebar-favorites`), sem dono, fazia duas contas na
 * mesma máquina compartilharem os atalhos. A chave nova segue a convenção da casa
 * `zapp.<area>:<dono>`; a antiga é migrada uma única vez (copiada para o dono e
 * removida do global) e nada é apagado no logout.
 */

/** Chave global anterior a este cartão. */
const LEGACY_STORAGE_KEY = 'sidebar-favorites';
const MAX_FAVORITES = 6;
const SEM_AUTH_PROVIDER = 'useAuth must be used within an AuthProvider';

/** Convenção da casa: `zapp.<area>:<dono>`. */
export function sidebarFavoritesStorageKey(userId: string): string {
  return `zapp.sidebar.favorites:${userId}`;
}

function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Lê os favoritos do dono. Sem chave própria, migra a chave antiga uma única vez:
 * copia o valor para o usuário e remove o global. Sem dono não lê nem grava — a
 * preferência nunca volta para o navegador.
 */
function readFavorites(storageKey: string | null): string[] {
  if (!storageKey) return [];
  const own = safeGetItem(storageKey);
  const legacy = safeGetItem(LEGACY_STORAGE_KEY);
  if (own !== null) {
    if (legacy !== null) safeRemoveItem(LEGACY_STORAGE_KEY);
    return parseFavorites(own);
  }
  if (legacy !== null) {
    const migrado = parseFavorites(legacy);
    safeSetJSON(storageKey, migrado);
    safeRemoveItem(LEGACY_STORAGE_KEY);
    return migrado;
  }
  return [];
}

/** Id do usuário logado; `null` fora do `AuthProvider` (montagem de teste, storybook). */
function useOwnerId(): string | null {
  try {
    return useAuth().profile?.id ?? null;
  } catch (erro) {
    if (erro instanceof Error && erro.message === SEM_AUTH_PROVIDER) return null;
    throw erro;
  }
}

interface FavoritesState {
  key: string | null;
  favorites: string[];
}

export function useSidebarFavorites() {
  const ownerId = useOwnerId();
  const storageKey = ownerId ? sidebarFavoritesStorageKey(ownerId) : null;

  const [state, setState] = useState<FavoritesState>(() => ({
    key: storageKey,
    favorites: readFavorites(storageKey),
  }));

  // Trocar de dono (login, troca de conta) recomeça da chave dele — nunca carrega
  // o conjunto do usuário anterior.
  if (state.key !== storageKey) {
    setState({ key: storageKey, favorites: readFavorites(storageKey) });
  }

  const favorites = state.favorites;

  const toggleFavorite = useCallback(
    (id: string) => {
      setState((current) => {
        const atual = current.favorites;
        let next: string[];
        if (atual.includes(id)) next = atual.filter((f) => f !== id);
        else if (atual.length >= MAX_FAVORITES) return current;
        else next = [...atual, id];

        if (storageKey) {
          if (next.length > 0) safeSetJSON(storageKey, next);
          else safeRemoveItem(storageKey);
        }
        return { key: storageKey, favorites: next };
      });
    },
    [storageKey],
  );

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  return { favorites, toggleFavorite, isFavorite, maxReached: favorites.length >= MAX_FAVORITES };
}
