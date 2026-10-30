import { renderHook } from '@testing-library/react';
import { useConversationScore } from '../useConversationScore';

const FULL_BRINDE = {
  budget: true,
  responsible: true,
  intent: true,
  number: true,
  date: true,
  delivery: true,
};

const EMPTY_BRINDE = {
  budget: false,
  responsible: false,
  intent: false,
  number: false,
  date: false,
  delivery: false,
};

describe('useConversationScore', () => {
  it('score A com todos os fatores excelentes', () => {
    const { result } = renderHook(() =>
      useConversationScore({
        brinde: FULL_BRINDE,
        avgResponseSeconds: 20,
        suggestionAcceptanceRate: 1,
        clientMessageCount: 15,
      }),
    );
    expect(result.current.grade).toBe('A');
    expect(result.current.total).toBeGreaterThanOrEqual(90);
  });

  it('score F com todos os fatores ruins', () => {
    const { result } = renderHook(() =>
      useConversationScore({
        brinde: EMPTY_BRINDE,
        avgResponseSeconds: 600,
        suggestionAcceptanceRate: 0,
        clientMessageCount: 0,
      }),
    );
    expect(result.current.grade).toBe('F');
    expect(result.current.total).toBeLessThan(45);
  });

  it('retorna 4 dimensões', () => {
    const { result } = renderHook(() =>
      useConversationScore({
        brinde: FULL_BRINDE,
        avgResponseSeconds: 90,
        suggestionAcceptanceRate: 0.5,
        clientMessageCount: 5,
      }),
    );
    expect(result.current.dimensions).toHaveLength(4);
  });

  it('total está entre 0 e 100', () => {
    const { result } = renderHook(() =>
      useConversationScore({
        brinde: { ...FULL_BRINDE, budget: false },
        avgResponseSeconds: 150,
        suggestionAcceptanceRate: 0.6,
        clientMessageCount: 8,
      }),
    );
    expect(result.current.total).toBeGreaterThanOrEqual(0);
    expect(result.current.total).toBeLessThanOrEqual(100);
  });

  it('topRecommendation é string não vazia', () => {
    const { result } = renderHook(() =>
      useConversationScore({
        brinde: EMPTY_BRINDE,
        avgResponseSeconds: 30,
        suggestionAcceptanceRate: 0.8,
        clientMessageCount: 10,
      }),
    );
    expect(typeof result.current.topRecommendation).toBe('string');
    expect(result.current.topRecommendation.length).toBeGreaterThan(0);
  });
});
