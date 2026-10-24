import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePriceAnchor } from '../usePriceAnchor';

const invokeEdgeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: invokeEdgeMock }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const BASE_OPTIONS = {
  conversationId: 'conv-1',
  contactId: 'contact-1',
  messages: [{ content: 'muito caro', sender: 'contact' }],
  sellerMaxDiscountPct: 15,
};

describe('usePriceAnchor', () => {
  beforeEach(() => invokeEdgeMock.mockReset());

  it('guardrailTriggered false quando dentro do limite', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: { valueFraming: 'retorno 3x', proposedDiscountPct: 10 },
      error: null,
    });
    const { result } = renderHook(() => usePriceAnchor(BASE_OPTIONS));
    await act(async () => result.current.analyze('pode dar 10%?'));
    expect(result.current.state.guardrailTriggered).toBe(false);
    expect(result.current.state.proposedDiscountPct).toBe(10);
  });

  it('guardrailTriggered true quando acima do limite', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: { valueFraming: 'retorno 3x', proposedDiscountPct: 20 },
      error: null,
    });
    const { result } = renderHook(() => usePriceAnchor(BASE_OPTIONS));
    await act(async () => result.current.analyze('pode dar 20%?'));
    expect(result.current.state.guardrailTriggered).toBe(true);
  });

  it('dismiss limpa o estado', async () => {
    invokeEdgeMock.mockResolvedValue({
      data: { valueFraming: 'ok', proposedDiscountPct: 5 },
      error: null,
    });
    const { result } = renderHook(() => usePriceAnchor(BASE_OPTIONS));
    await act(async () => result.current.analyze('desconto'));
    act(() => result.current.dismiss());
    expect(result.current.state.guardrailTriggered).toBe(false);
    expect(result.current.state.proposedDiscountPct).toBeNull();
  });
});
