/**
 * Item 7 da rodada de robustez: os ids do construtor de mensagem interativa
 * nasciam de `Date.now()`. Dois botoes (ou duas linhas) criados no mesmo
 * milissegundo recebiam o MESMO id — colisao de key e de seleção de item.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { useInteractiveMessage } from '@/components/inbox/interactive-builder/useInteractiveMessage';

beforeEach(() => {
  // Congela o relogio: com Date.now() os ids sairiam iguais (era o defeito).
  vi.spyOn(Date, 'now').mockReturnValue(1234567890);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useInteractiveMessage — ids unicos', () => {
  it('dois botoes criados no mesmo instante recebem ids diferentes', () => {
    const { result } = renderHook(() => useInteractiveMessage());

    act(() => {
      result.current.addButton('quick_reply');
      result.current.addButton('url');
    });

    const ids = result.current.buttons.map((button) => button.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('duas linhas da mesma secao criadas no mesmo instante recebem ids diferentes', () => {
    const { result } = renderHook(() => useInteractiveMessage());

    act(() => {
      result.current.addSection();
    });
    act(() => {
      result.current.addRowToSection(0);
      result.current.addRowToSection(0);
    });

    const rows = result.current.sections[0].rows;
    const ids = rows.map((row) => row.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('duas secoes criadas no mesmo instante ficam com ids diferentes', () => {
    const { result } = renderHook(() => useInteractiveMessage());

    act(() => {
      result.current.addSection();
      result.current.addSection();
    });

    const expanded = result.current.expandedSections;
    expect(expanded).toHaveLength(2);
    expect(new Set(expanded).size).toBe(2);
  });
});
