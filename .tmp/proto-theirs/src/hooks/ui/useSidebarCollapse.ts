import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/safeStorage';

/**
 * HZ2-007 / HZ5-19 — o recolhimento da barra lateral pertence ao USUÁRIO, não ao
 * navegador. A chave nova segue a convenção da casa `zapp.<area>:<dono>`; a antiga
 * (`zapp-sidebar-collapsed`) é migrada uma única vez e nada é apagado no logout.
 */

/** Chave global anterior a este cartão. */
const LEGACY_STORAGE_KEY = 'zapp-sidebar-collapsed';
/** Sem valor gravado, a barra nasce recolhida — comportamento anterior preservado. */
const DEFAULT_COLLAPSED = true;
const SEM_AUTH_PROVIDER = 'useAuth must be used within an AuthProvider';

/** Convenção da casa: `zapp.<area>:<dono>`. */
export function sidebarCollapsedStorageKey(userId: string): string {
  return `zapp.sidebar.collapsed:${userId}`;
}

function parseCollapsed(raw: string | null): boolean {
  return raw === null ? DEFAULT_COLLAPSED : raw === 'true';
}

/**
 * Lê o recolhimento do dono. Sem chave própria, migra a chave antiga uma única vez.
 * Sem dono, devolve o padrão sem ler nem gravar o global.
 */
function readCollapsed(storageKey: string | null): boolean {
  if (!storageKey) return DEFAULT_COLLAPSED;
  const own = safeGetItem(storageKey);
  const legacy = safeGetItem(LEGACY_STORAGE_KEY);
  if (own !== null) {
    if (legacy !== null) safeRemoveItem(LEGACY_STORAGE_KEY);
    return parseCollapsed(own);
  }
  if (legacy !== null) {
    safeSetItem(storageKey, legacy);
    safeRemoveItem(LEGACY_STORAGE_KEY);
    return parseCollapsed(legacy);
  }
  return DEFAULT_COLLAPSED;
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

export function useSidebarCollapse() {
  const ownerId = useOwnerId();
  const storageKey = ownerId ? sidebarCollapsedStorageKey(ownerId) : null;

  const [state, setState] = useState(() => ({
    key: storageKey,
    collapsed: readCollapsed(storageKey),
  }));

  // Trocar de dono recomeça da chave dele, sem herdar o valor do anterior.
  if (state.key !== storageKey) {
    setState({ key: storageKey, collapsed: readCollapsed(storageKey) });
  }

  const toggle = useCallback(() => {
    setState((current) => {
      const next = !current.collapsed;
      if (storageKey) safeSetItem(storageKey, String(next));
      return { key: storageKey, collapsed: next };
    });
  }, [storageKey]);

  // Listen for toggle-sidebar custom event (keyboard shortcut)
  useEffect(() => {
    const handler = () => toggle();
    document.addEventListener('toggle-sidebar', handler);
    return () => document.removeEventListener('toggle-sidebar', handler);
  }, [toggle]);

  return { collapsed: state.collapsed, toggle };
}
