import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSearchHistory } from '@/hooks/system/useSearchHistory';

// R2-PLAT-006: as buscas recentes não podem atravessar contas no mesmo perfil de
// navegador. A identidade vigente é trocada por este objeto entre renders/unmounts.
const authState = vi.hoisted(() => ({
  profile: { id: 'user-a' } as { id: string } | null,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: authState.profile }),
}));

/** Chaves de armazenamento: o escopo por usuário é o contrato que impede o vazamento. */
const KEY_A = 'zapp.search.history:user-a';
const KEY_B = 'zapp.search.history:user-b';
const LEGACY_KEY = 'global-search-history';

function storedValues(): string {
  return Object.keys(localStorage)
    .map((key) => localStorage.getItem(key) ?? '')
    .join('|');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  authState.profile = { id: 'user-a' };
});

describe('useSearchHistory', () => {
  it('initializes with empty history', () => {
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it('adds item to history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('test query', 5);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].query).toBe('test query');
    expect(result.current.history[0].resultCount).toBe(5);
  });

  it('ignores empty queries', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('', 0);
    });

    expect(result.current.history).toEqual([]);
  });

  it('ignores short queries (less than 2 chars)', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('a', 0);
    });

    expect(result.current.history).toEqual([]);
  });

  it('deduplicates queries (case-insensitive)', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('Test Query', 5);
    });

    act(() => {
      result.current.addToHistory('test query', 10);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].resultCount).toBe(10);
  });

  it('limits history to 10 items', () => {
    const { result } = renderHook(() => useSearchHistory());

    for (let i = 0; i < 15; i++) {
      act(() => {
        result.current.addToHistory(`query ${i}`, i);
      });
    }

    expect(result.current.history.length).toBeLessThanOrEqual(10);
  });

  it('removes specific item from history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('keep me', 1);
    });
    act(() => {
      result.current.addToHistory('remove me', 2);
    });

    act(() => {
      result.current.removeFromHistory('remove me');
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].query).toBe('keep me');
  });

  it('clears all history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('query 1', 1);
    });
    act(() => {
      result.current.addToHistory('query 2', 2);
    });

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem(KEY_A)).toBeNull();
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('persisted query', 3);
    });

    const stored = localStorage.getItem(KEY_A);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed[0].query).toBe('persisted query');
  });

  it('loads history from localStorage on mount', () => {
    localStorage.setItem(KEY_A, JSON.stringify([
      { query: 'loaded', timestamp: Date.now(), resultCount: 7 },
    ]));

    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].query).toBe('loaded');
  });

  it('handles corrupted localStorage data', () => {
    localStorage.setItem(KEY_A, 'not-json');
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it('most recent query is first in history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('first query', 1);
    });
    act(() => {
      result.current.addToHistory('second query', 2);
    });

    expect(result.current.history[0].query).toBe('second query');
  });

  it('trims whitespace from queries', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('  trimmed  ', 1);
    });

    expect(result.current.history[0].query).toBe('trimmed');
  });
});

describe('useSearchHistory — isolamento de buscas entre contas (R2-PLAT-006)', () => {
  it('grava o histórico numa chave escopada pelo usuário', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('termo da conta a', 3);
    });

    expect(Object.keys(localStorage)).toContain(KEY_A);
    expect(Object.keys(localStorage)).not.toContain(LEGACY_KEY);
    const stored = JSON.parse(localStorage.getItem(KEY_A)!);
    expect(stored[0].query).toBe('termo da conta a');
  });

  it('não mostra para outra conta o histórico da conta anterior', () => {
    const first = renderHook(() => useSearchHistory());
    act(() => {
      first.result.current.addToHistory('segredo da conta a', 7);
    });
    first.unmount();

    // troca de conta no mesmo navegador
    authState.profile = { id: 'user-b' };
    const second = renderHook(() => useSearchHistory());

    expect(second.result.current.history).toEqual([]);
    expect(second.result.current.history.map((item) => item.query)).not.toContain('segredo da conta a');
  });

  it('descarta o histórico da conta anterior sem desmontar o hook', () => {
    const { result, rerender } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('segredo da conta a', 7);
    });

    authState.profile = { id: 'user-b' };
    rerender();

    expect(result.current.history).toEqual([]);
  });

  it('logout (perfil nulo) tira o histórico da tela e não grava fora de escopo', () => {
    const { result, rerender } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('segredo da conta a', 7);
    });

    // signOut que falha remotamente ainda zera o perfil no cliente
    authState.profile = null;
    rerender();

    expect(result.current.history).toEqual([]);

    act(() => {
      result.current.addToHistory('busca depois do logout', 2);
    });

    // sem usuário nada novo é gravado e a chave global do vazamento não volta
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(storedValues()).not.toContain('busca depois do logout');
    // retenção definida: o termo da conta A fica só na chave do próprio dono
    expect(Object.keys(localStorage)).toEqual([KEY_A]);
    expect(JSON.parse(localStorage.getItem(KEY_A)!)[0].query).toBe('segredo da conta a');
  });

  it('restaura o histórico da própria conta ao voltar', () => {
    const first = renderHook(() => useSearchHistory());
    act(() => {
      first.result.current.addToHistory('minha busca', 4);
    });
    first.unmount();

    authState.profile = { id: 'user-a' };
    const second = renderHook(() => useSearchHistory());

    expect(second.result.current.history.map((item) => item.query)).toEqual(['minha busca']);
  });

  it('remove o histórico legado gravado sem escopo de usuário, sem exibi-lo', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([
      { query: 'termo legado da conta a', timestamp: Date.now(), resultCount: 2 },
    ]));

    const { result } = renderHook(() => useSearchHistory());

    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('mantém o histórico em memória quando o navegador recusa a gravação', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    try {
      const { result } = renderHook(() => useSearchHistory());

      expect(() => act(() => { result.current.addToHistory('termo sem gravação', 1); })).not.toThrow();
      expect(result.current.history.map((item) => item.query)).toEqual(['termo sem gravação']);
    } finally {
      setItem.mockRestore();
    }
  });

  it('não perde uma gravação quando duas buscas são registradas no mesmo lote', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('primeira busca', 1);
      result.current.addToHistory('segunda busca', 2);
    });

    expect(result.current.history.map((item) => item.query)).toEqual(['segunda busca', 'primeira busca']);
    const stored = JSON.parse(localStorage.getItem(KEY_A)!).map((item: { query: string }) => item.query);
    expect(stored).toEqual(['segunda busca', 'primeira busca']);
  });

  it('limpa da tela e do storage um histórico carregado antes da montagem', () => {
    localStorage.setItem(KEY_A, JSON.stringify([
      { query: 'busca carregada', timestamp: Date.now(), resultCount: 3 },
    ]));

    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history.map((item) => item.query)).toEqual(['busca carregada']);

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem(KEY_A)).toBeNull();
  });

  it('remove da tela e do storage um item carregado antes da montagem', () => {
    localStorage.setItem(KEY_A, JSON.stringify([
      { query: 'busca carregada', timestamp: Date.now(), resultCount: 3 },
    ]));

    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history.map((item) => item.query)).toEqual(['busca carregada']);

    act(() => {
      result.current.removeFromHistory('busca carregada');
    });

    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem(KEY_A)).toBeNull();
  });

  it('mantém as chaves de contas diferentes separadas', () => {
    localStorage.setItem(KEY_B, JSON.stringify([
      { query: 'busca da conta b', timestamp: Date.now(), resultCount: 9 },
    ]));

    const { result } = renderHook(() => useSearchHistory());

    // user-a não enxerga o que está gravado para user-b
    expect(result.current.history).toEqual([]);
  });
});
