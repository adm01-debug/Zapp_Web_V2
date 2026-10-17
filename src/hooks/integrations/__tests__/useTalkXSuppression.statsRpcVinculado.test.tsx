import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X179 — `useTalkXSuppressionStats` chama `talkx_suppression_stats` por RPC.
 *
 * O hook guarda a função numa const e a chama depois. No cliente real, `rpc` é
 * MÉTODO de protótipo e usa `this.rest`
 * (`node_modules/@supabase/supabase-js/dist/index.mjs`: `return this.rest.rpc(...)`),
 * então a referência solta perde o `this` e a chamada estoura. Aqui o duplo do
 * cliente reproduz isso: só passa quem vincula a função ao cliente.
 */

const h = vi.hoisted(() => ({ chamadas: [] as unknown[][] }));

const ESTATISTICAS = {
  active: { value: 3, previous: 2, series: [0, 1, 2, 3, 3, 3, 3, 3] },
  optouts: { value: 1, previous: 0, series: [0, 0, 0, 1, 1, 1, 1, 1] },
  manual: { value: 0, previous: 0, series: [0, 0, 0, 0, 0, 0, 0, 0] },
  protected: { value: 9, previous: 8, series: [1, 2, 3, 4, 5, 6, 7, 9], total_started: 12 },
};

vi.mock('@/integrations/supabase/client', () => {
  const proto = {
    rest: {
      rpc: async (nome: string, args: Record<string, unknown>) => {
        h.chamadas.push([nome, args]);
        return { data: ESTATISTICAS, error: null };
      },
    },
    // Espelha o SupabaseClient: método de protótipo que depende de `this.rest`.
    async rpc(this: { rest?: unknown } | undefined, nome: string, args: Record<string, unknown>) {
      if (!this?.rest) throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      return (this.rest as { rpc: (n: string, a: Record<string, unknown>) => Promise<unknown> }).rpc(nome, args);
    },
  };
  return { supabase: Object.create(proto) as Record<string, unknown> };
});

import { useTalkXSuppressionStats } from '../useTalkXSuppression';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useTalkXSuppressionStats · RPC vinculada ao cliente', () => {
  it('lê os números do servidor sem perder o this do cliente', async () => {
    h.chamadas.length = 0;

    const { result } = renderHook(() => useTalkXSuppressionStats(30), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).not.toBeUndefined());

    expect(h.chamadas).toEqual([['talkx_suppression_stats', { p_days: 30 }]]);
    expect(result.current.data).toMatchObject({ protected: { total_started: 12 } });
    expect(result.current.isError).toBe(false);
  });
});
