import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { useSentimentTrend } from '../useSentimentTrend';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

const day = (dia: string, total: number, positivos: number) => ({
  dia,
  total,
  positivos,
  neutros: 0,
  negativos: total - positivos,
  media: 80,
  indice: 0.5,
});

describe('useSentimentTrend do Dashboard', () => {
  beforeEach(() => rpc.mockReset());

  it('consulta a RPC tipada para duas janelas e preserva a separação do gráfico', async () => {
    rpc.mockResolvedValue({
      data: [
        day('2026-10-25', 1, 1),
        day('2026-10-26', 0, 0),
        day('2026-10-27', 4, 3),
        day('2026-10-28', 2, 1),
      ],
      error: null,
    });

    const { result } = renderHook(() => useSentimentTrend(2), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(rpc).toHaveBeenCalledExactlyOnceWith('sentiment_trend', { p_days: 4 });
    expect(result.current.error).toBeNull();
    expect(result.current.previous).toMatchObject([{ date: '2026-10-25', total: 1 }]);
    expect(result.current.data).toMatchObject([
      { date: '2026-10-27', total: 4, positive: 75 },
      { date: '2026-10-28', total: 2, positive: 50 },
    ]);
  });

  it('expõe erro da RPC à tela em vez de apresentar uma série vazia', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('leitura indisponível') });

    const { result } = renderHook(() => useSentimentTrend(7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(rpc).toHaveBeenCalledExactlyOnceWith('sentiment_trend', { p_days: 14 });
    expect(result.current.error?.message).toBe('leitura indisponível');
    expect(result.current.data).toBeNull();
  });
});
