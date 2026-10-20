import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SENTIMENT_CLASSES } from '@/lib/sentiment-classes';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  gte: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
}));

import { useAIInsights } from '../useRecentAnalyses';

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ gte: mocks.gte });
});

describe('useAIInsights — classes canônicas de sentimento', () => {
  it('expõe as três classes possíveis e agrega critico como negativo sem contar desconhecido', async () => {
    mocks.gte.mockResolvedValue({
      data: [
        { sentiment: 'critico', sentiment_score: 10, department: 'Suporte' },
        { sentiment: 'fora-do-vocabulario', sentiment_score: 20, department: 'Vendas' },
        { sentiment: 'positivo', sentiment_score: 90, department: 'Vendas' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useAIInsights('24h'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(SENTIMENT_CLASSES).toEqual(['positivo', 'neutro', 'negativo']);
    expect(result.current.data).toMatchObject({
      total: 3,
      negativePct: 33,
      topNegativeDepartment: 'Suporte',
    });
  });
});
