import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFilesSelection } from '@/hooks/chat/useFilesSelection';

beforeEach(() => {
  localStorage.clear();
});

describe('useFilesSelection', () => {
  it('alterna por ID, entra e sai do modo selecao', () => {
    const { result } = renderHook(({ ids }) => useFilesSelection(ids, 'c1'), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });

    expect(result.current.selectionMode).toBe(false);
    act(() => result.current.enter());
    expect(result.current.selectionMode).toBe(true);

    act(() => result.current.toggle('b'));
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.selectedIds.has('b')).toBe(true);

    act(() => result.current.toggle('b'));
    expect(result.current.selectedCount).toBe(0);

    act(() => result.current.toggle('a'));
    act(() => result.current.exit());
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  it('selecionar tudo pega so o recorte visivel; trocar de filtro preserva a selecao', () => {
    const { result, rerender } = renderHook(({ ids }) => useFilesSelection(ids, 'c1'), {
      initialProps: { ids: Array.from({ length: 56 }, (_, i) => `item-${i}`) },
    });

    act(() => result.current.enter());
    const videos = ['item-3', 'item-7'];
    rerender({ ids: videos });
    act(() => result.current.selectAllVisible());
    expect(result.current.selectedCount).toBe(2);

    // volta para "Todos": a selecao dos 2 continua, agora dentro do recorte
    const todos = Array.from({ length: 56 }, (_, i) => `item-${i}`);
    rerender({ ids: todos });
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.selectedOutsideFilter).toEqual([]);

    // seleciona tudo de novo: 56
    act(() => result.current.selectAllVisible());
    expect(result.current.selectedCount).toBe(56);

    // filtro "Videos": 54 fora do recorte, contagem explicita
    rerender({ ids: videos });
    expect(result.current.selectedCount).toBe(56);
    expect(result.current.selectedOutsideFilter).toHaveLength(54);
  });

  it('trocar de contato zera a selecao e sai do modo selecao', () => {
    const { result, rerender } = renderHook(({ contactId }) => useFilesSelection(['a', 'b'], contactId), {
      initialProps: { contactId: 'c1' },
    });
    act(() => result.current.enter());
    act(() => result.current.toggle('a'));
    expect(result.current.selectedCount).toBe(1);

    rerender({ contactId: 'c2' });
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.selectionMode).toBe(false);
  });

  it('nao zera quando outra coisa rerenderiza (acao que falhou mantem a selecao)', () => {
    const { result, rerender } = renderHook(({ ids }) => useFilesSelection(ids, 'c1'), {
      initialProps: { ids: ['a', 'b'] },
    });
    act(() => result.current.enter());
    act(() => result.current.toggle('a'));

    // rerender com nova identidade de array (o filtro reordenou, a acao falhou, etc.)
    rerender({ ids: ['b', 'a'] });
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.selectedIds.has('a')).toBe(true);
  });

  it('nunca persiste ID em storage', () => {
    const { result } = renderHook(() => useFilesSelection(['a'], 'c1'));
    act(() => result.current.enter());
    act(() => result.current.toggle('a'));

    const dump = Object.keys(localStorage).map((key) => `${key}=${localStorage.getItem(key)}`).join('|');
    expect(dump).not.toContain('item-');
    expect(localStorage.length).toBe(0);
  });

  it('remove tira so o id excluido, sem zerar o resto nem sair do modo selecao (etapa 35)', () => {
    const { result } = renderHook(() => useFilesSelection(['a', 'b', 'c'], 'c1'));
    act(() => result.current.enter());
    act(() => result.current.selectAllVisible());
    expect(result.current.selectedCount).toBe(3);

    act(() => result.current.remove('b'));
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.selectedIds.has('a')).toBe(true);
    expect(result.current.selectedIds.has('b')).toBe(false);
    expect(result.current.selectionMode).toBe(true);

    act(() => result.current.remove('nao-existe'));
    expect(result.current.selectedCount).toBe(2);
  });
});
