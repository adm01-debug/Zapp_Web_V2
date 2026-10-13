import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, order, limit, maybeSingle };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => h.from(...args) },
}));

import { useLatestAnalysis } from '@/hooks/chat/useLatestAnalysis';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const analise = {
  id: 'a1',
  summary: 'Cliente pediu prazo',
  status: 'done',
  sentiment: 'positivo',
  sentiment_score: 7,
  urgency: 'alta',
  department: 'Vendas',
  customer_satisfaction: 4,
  key_points: ['prazo'],
  topics: ['logistica'],
  created_at: '2026-10-01T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useLatestAnalysis', () => {
  it('sucesso devolve a análise e não marca erro', async () => {
    h.maybeSingle.mockResolvedValue({ data: analise, error: null });

    const { result } = renderHook(() => useLatestAnalysis('c1'), { wrapper: wrapperFor(makeClient()) });

    await waitFor(() => expect(result.current.data).toEqual(analise));
    expect(result.current.isError).toBe(false);
  });

  it('erro de leitura vira isError, NÃO "sem análise"', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied for table conversation_analyses' } });

    const { result } = renderHook(() => useLatestAnalysis('c1'), { wrapper: wrapperFor(makeClient()) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Sem a análise, mas o erro ficou visível: a UI não trata como "contato sem análise".
    expect(result.current.data).toBeUndefined();
  });

  it('sem contactId não consulta o banco', () => {
    const { result } = renderHook(() => useLatestAnalysis(null), { wrapper: wrapperFor(makeClient()) });

    expect(h.from).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
