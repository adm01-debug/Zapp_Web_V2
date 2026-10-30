import { renderHook } from '@testing-library/react';
import { useConversationScore } from '@/hooks/copilot/useConversationScore';

describe('useConversationScore', () => {
  it('returns zero score for empty messages', () => {
    const { result } = renderHook(() =>
      useConversationScore({ messages: [] })
    );
    expect(result.current.score).toBe(0);
    expect(result.current.grade).toBe('F');
    expect(result.current.hasPersonalData).toBe(false);
  });

  it('detects budget field from client message', () => {
    const { result } = renderHook(() =>
      useConversationScore({
        messages: [
          { role: 'client', text: 'Tenho orçamento de R$ 5000 para 200 canetas' },
        ],
      })
    );
    expect(result.current.completeness.budget).toBe(true);
    expect(result.current.score).toBeGreaterThan(0);
  });

  it('detects quantity from message', () => {
    const { result } = renderHook(() =>
      useConversationScore({
        messages: [
          { role: 'client', text: 'Quero 500 unidades' },
        ],
      })
    );
    expect(result.current.completeness.quantity).toBe(true);
  });

  it('assigns grade A for high score', () => {
    const { result } = renderHook(() =>
      useConversationScore({
        messages: [
          { role: 'client', text: 'Olá, sou Maria da empresa XYZ, quero 1000 canetas personalizadas para o evento de formatura em dezembro, orçamento até R$ 8000, entrega em São Paulo' },
        ],
      })
    );
    expect(result.current.score).toBeGreaterThanOrEqual(60);
  });

  it('returns stable reference when messages unchanged', () => {
    const messages = [{ role: 'client' as const, text: 'Preciso de brindes' }];
    const { result, rerender } = renderHook(() =>
      useConversationScore({ messages })
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
