import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConversationScore } from '../hooks/copilot/useConversationScore';

const fullBrinde = { budget: true, responsible: true, intent: true, number: true, date: true, delivery: true };
const emptyBrinde = { budget: false, responsible: false, intent: false, number: false, date: false, delivery: false };

describe('useConversationScore', () => {
  it('grade A quando tudo preenchido e resposta rápida', () => {
    const { result } = renderHook(() =>
      useConversationScore({ brinde: fullBrinde, avgResponseSeconds: 30, suggestionAcceptanceRate: 1, clientMessageCount: 20 })
    );
    expect(result.current.grade).toBe('A');
    expect(result.current.total).toBeGreaterThanOrEqual(90);
  });

  it('grade F quando BRINDE vazio e métricas ruins', () => {
    const { result } = renderHook(() =>
      useConversationScore({ brinde: emptyBrinde, avgResponseSeconds: 600, suggestionAcceptanceRate: 0, clientMessageCount: 0 })
    );
    expect(result.current.grade).toBe('F');
    expect(result.current.total).toBeLessThan(45);
  });

  it('retorna dimensions com score e weight', () => {
    const { result } = renderHook(() =>
      useConversationScore({ brinde: fullBrinde, avgResponseSeconds: 60, suggestionAcceptanceRate: 0.5, clientMessageCount: 5 })
    );
    expect(result.current.dimensions.length).toBeGreaterThan(0);
    expect(result.current.dimensions[0]).toHaveProperty('score');
    expect(result.current.dimensions[0]).toHaveProperty('weight');
  });

  it('topRecommendation é string não vazia', () => {
    const { result } = renderHook(() =>
      useConversationScore({ brinde: emptyBrinde, avgResponseSeconds: 300, suggestionAcceptanceRate: 0.2, clientMessageCount: 3 })
    );
    expect(typeof result.current.topRecommendation).toBe('string');
    expect(result.current.topRecommendation.length).toBeGreaterThan(0);
  });
});
