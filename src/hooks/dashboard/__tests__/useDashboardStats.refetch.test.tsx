/**
 * Regressão do achado DASH-REALTIME-001 (item 37 do BACKLOG_VERIFICADO) na parte
 * "refresh rejeitado": em `useDashboardStats` o `refetch` não tem `return` — devolve
 * `void`. O DashboardView faz `await refetch()`; o await resolve na hora, o spinner
 * fecha por `setTimeout(500)` e a falha da leitura não chega a quem chamou.
 *
 * Contrato exigido: `refetch()` devolve a Promise das três leituras (`Promise.all`),
 * que só resolve DEPOIS que elas terminam (e com a falha visível no estado). Vermelho
 * no código atual, verde com a correção (cartão seguinte).
 *
 * Comando local: bun run test src/hooks/dashboard/__tests__/useDashboardStats.refetch.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const counts = { total: 12, open: 4, pending: 2, myActive: 1, queues: [] };

let falharLeitura = false;
/** Portão das leituras: com `segurar`, as queries ficam pendentes até soltarLeituras(). */
let segurar = false;
let portoes: Array<() => void> = [];

function controlado<T>(valor: T): Promise<T> {
  if (!segurar) return Promise.resolve(valor);
  return new Promise<T>(resolve => {
    portoes.push(() => resolve(valor));
  });
}

async function flush() {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function soltarLeituras() {
  segurar = false;
  const fila = portoes;
  portoes = [];
  for (const soltar of fila) soltar();
  await flush();
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ or: () => controlado({ data: [], error: null }) }) };
      }
      return { select: () => ({ eq: () => controlado({ data: [], error: null }) }) };
    }),
    rpc: vi.fn(async () => {
      if (falharLeitura) throw new Error('leitura falhou');
      return { data: counts, error: null };
    }),
  },
}));

vi.mock('@/hooks/crm/useAgentPresence', () => ({ useAgentPresenceMap: () => ({}) }));

import { useDashboardStats } from '@/hooks/dashboard/useDashboardStats';

function renderStats() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDashboardStats({}), { wrapper });
}

beforeEach(() => {
  falharLeitura = false;
  segurar = false;
  portoes = [];
});

describe('useDashboardStats — refresh rejeitado', () => {
  it('refetch devolve a Promise das leituras e propaga a falha do refresh', async () => {
    const { result } = renderStats();
    await waitFor(() => expect(result.current.counts).toBeDefined());

    falharLeitura = true; // a leitura da RPC rejeita
    segurar = true; // as outras duas ficam pendentes no portão

    const refetchAtual = result.current.refetch as () => unknown;
    const promessa = refetchAtual();

    // hoje: `refetch: () => { ... }` sem return → undefined, e `await refetch()` do
    // DashboardView resolve imediatamente (o spinner fecha por setTimeout, não pela leitura)
    expect(promessa).toBeInstanceOf(Promise);

    let resolvida = false;
    void (promessa as Promise<unknown>).then(() => {
      resolvida = true;
    });
    await flush();

    expect(resolvida).toBe(false); // as leituras do refresh ainda estão pendentes
    expect(portoes.length).toBeGreaterThan(0);

    await soltarLeituras();
    await (promessa as Promise<unknown>);
    await flush();

    expect(resolvida).toBe(true);
    // a falha da leitura não fica escondida: quem chamou o refresh vê o erro no estado
    expect(result.current.error).toBeTruthy();
  });
});
