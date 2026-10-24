import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useObjectionHandler } from '../useObjectionHandler';

const invokeEdgeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: invokeEdgeMock }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const BASE_OPTIONS = {
  conversationId: 'conv-1',
  contactId: 'contact-1',
  messages: [{ content: 'olá', sender: 'contact' }],
};

describe('useObjectionHandler', () => {
  beforeEach(() => invokeEdgeMock.mockReset());

  it('retorna estado vazio inicialmente', () => {
    const { result } = renderHook(() => useObjectionHandler(BASE_OPTIONS));
    expect(result.current.state.objectionType).toBeNull();
    expect(result.current.state.loading).toBe(false);
  });

  it('não analisa se disabled', async () => {
    const { result } = renderHook(() =>
      useObjectionHandler({ ...BASE_OPTIONS, enabled: false }),
    );
    await act(async () => result.current.analyze('muito caro'));
    expect(invokeEdgeMock).not.toHaveBeenCalled();
  });

  it('popula estado após resposta bem-sucedida', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: {
        objectionType: 'price',
        treatmentScript: 'Entendo a preocupação com o preço...',
        battlecard: null,
      },
      error: null,
    });

    const { result } = renderHook(() => useObjectionHandler(BASE_OPTIONS));
    await act(async () => result.current.analyze('muito caro'));

    expect(result.current.state.objectionType).toBe('price');
    expect(result.current.state.treatmentScript).toBe('Entendo a preocupação com o preço...');
    expect(result.current.state.loading).toBe(false);
  });

  it('dismiss limpa o estado', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: { objectionType: 'price', treatmentScript: 'script' },
      error: null,
    });
    const { result } = renderHook(() => useObjectionHandler(BASE_OPTIONS));
    await act(async () => result.current.analyze('caro demais'));
    act(() => result.current.dismiss());
    expect(result.current.state.objectionType).toBeNull();
  });

  it('falha silenciosamente em caso de erro', async () => {
    invokeEdgeMock.mockResolvedValue({ data: null, error: 'timeout' });
    const { result } = renderHook(() => useObjectionHandler(BASE_OPTIONS));
    await act(async () => result.current.analyze('muito caro'));
    expect(result.current.state.loading).toBe(false);
    expect(result.current.state.objectionType).toBeNull();
  });
});
