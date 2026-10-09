/**
 * Regressão do #444 (retomada 08/10/2026): a busca global é montada em telas e
 * testes que NÃO têm AuthProvider — GlobalSearch → useGlobalSearchData →
 * useSearchHistory. Quando o hook passou a exigir o provider (useAuth), o
 * render estourou e derrubou 5 testes de GlobalSearch.r2-inb-020 e 5 de
 * GlobalSearch.r2-inb-018 na verificação da integração.
 *
 * Este arquivo prova o contrato que ficou: sem identidade não existe histórico —
 * o hook monta, mostra lista vazia e não grava nada em lugar nenhum (nem na
 * chave global antiga, nem na chave de outro dono).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSearchHistory } from '@/hooks/system/useSearchHistory';

describe('useSearchHistory sem AuthProvider (busca global em tela isolada)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('monta sem provider sem estourar o render, vazio e sem histórico de ninguém', () => {
    // Sem wrapper: nenhum AuthProvider montado nesta renderização.
    const { result } = renderHook(() => useSearchHistory());

    expect(result.current.history).toEqual([]);
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it('não grava nem mostra histórico quando não há usuário logado', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('termo de quem não está logado', 3);
    });

    expect(result.current.history).toEqual([]);
    // Nada é persistido sem dono: a chave global do vazamento não volta a existir.
    expect(storedQueries()).toEqual([]);
  });

  it('limpar e remover sem identidade não criam chave de armazenamento', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.clearHistory();
      result.current.removeFromHistory('qualquer termo');
    });

    expect(result.current.history).toEqual([]);
    expect(storedQueries()).toEqual([]);
  });
});

/** Todo o conteúdo gravado no armazenamento, independente do escopo da chave. */
function storedQueries(): string[] {
  return Object.keys(localStorage).flatMap((key) => {
    const raw = localStorage.getItem(key) ?? '';
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item: { query: string }) => item.query) : [raw];
    } catch {
      return [raw];
    }
  });
}
