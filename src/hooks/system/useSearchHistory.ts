import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';

/**
 * Chave global usada antes da correção (R2-PLAT-006): sem o dono, as buscas
 * recentes de uma conta apareciam para a próxima conta no mesmo navegador.
 */
const LEGACY_HISTORY_KEY = 'global-search-history';
const MAX_HISTORY = 10;
/** Identidade estável para o estado "sem usuário" (evita array novo a cada render). */
const NO_HISTORY: SearchHistoryItem[] = [];

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  resultCount?: number;
}

/**
 * Convenção da casa: `zapp.<area>:<dono>` em localStorage — o histórico é do
 * usuário, não do navegador (mesmo escopo dos rascunhos do Team Chat).
 */
export function searchHistoryStorageKey(userId: string): string {
  return `zapp.search.history:${userId}`;
}

/** Lê o histórico do dono. Sem dono (ou dado corrompido) não há histórico. */
function readHistory(storageKey: string | null): SearchHistoryItem[] {
  if (!storageKey) return NO_HISTORY;
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return NO_HISTORY;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : NO_HISTORY;
  } catch {
    return NO_HISTORY;
  }
}

/**
 * Histórico gravado antes do escopo por usuário não tem dono identificável;
 * é removido sem leitura para que nenhuma conta herde os termos da anterior.
 */
function purgeLegacyHistory(): void {
  try { localStorage.removeItem(LEGACY_HISTORY_KEY); } catch { /* storage unavailable */ }
}

/**
 * Histórico de buscas do usuário logado.
 *
 * Retenção definida: o histórico fica guardado para a própria identidade entre
 * sessões e nunca é lido, mostrado ou gravado sem usuário. Sem sessão (logout)
 * o hook não lê nem escreve nada — inclusive quando o signOut falha no servidor
 * e só o estado local da sessão é zerado.
 */
export function useSearchHistory() {
  const { profile } = useAuth();
  const storageKey = profile?.id ? searchHistoryStorageKey(profile.id) : null;

  /**
   * Histórico por dono, em memória. A chave é a identidade: a troca de conta no
   * mesmo navegador (com ou sem desmontar o hook) não reaproveita o que a conta
   * anterior carregou, e o logout não deixa termo alheio na tela.
   */
  const [byOwner, setByOwner] = useState<Record<string, SearchHistoryItem[]>>({});

  // O legado sem dono é descartado uma vez por montagem, sem ser lido.
  useEffect(() => { purgeLegacyHistory(); }, []);

  const loaded = useMemo(() => readHistory(storageKey), [storageKey]);
  const history = storageKey ? byOwner[storageKey] ?? loaded : NO_HISTORY;

  /**
   * Aplica a mudança sobre o estado VIVO do dono (duas gravações no mesmo lote
   * compõem em vez de sobrescrever) e persiste na chave dele.
   */
  const persist = useCallback((mutate: (current: SearchHistoryItem[]) => SearchHistoryItem[]) => {
    if (!storageKey) return;
    setByOwner((prev) => {
      const next = mutate(prev[storageKey] ?? loaded);
      try {
        if (next.length > 0) {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch { /* storage unavailable */ }
      return { ...prev, [storageKey]: next };
    });
  }, [loaded, storageKey]);

  const addToHistory = useCallback((query: string, resultCount?: number) => {
    if (!query.trim() || query.length < 2) return;
    // Sem usuário não há histórico: nada é gravado fora da chave do dono.
    if (!storageKey) return;

    persist((current) => {
      // Remove duplicates
      const filtered = current.filter((item) => item.query.toLowerCase() !== query.toLowerCase());

      return [
        { query: query.trim(), timestamp: Date.now(), resultCount },
        ...filtered,
      ].slice(0, MAX_HISTORY);
    });
  }, [persist, storageKey]);

  const removeFromHistory = useCallback((query: string) => {
    persist((current) => current.filter((item) => item.query !== query));
  }, [persist]);

  const clearHistory = useCallback(() => {
    if (!storageKey) return;
    try { localStorage.removeItem(storageKey); } catch { /* storage unavailable */ }
    setByOwner((prev) => ({ ...prev, [storageKey]: NO_HISTORY }));
  }, [storageKey]);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
