/**
 * Prova do fio: a série diária e os totais do histórico carregam a RESOLUÇÃO.
 *
 * O `useSLAHistory` alimenta `sparkRes` no dashboard. Aqui se prova que a série
 * diária passa a trazer `resolutionRate` (pendente fora da conta) e que os
 * totais do período trazem avaliadas/pendentes de resolução — sem mexer na
 * contagem de 1ª resposta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { format } from 'date-fns';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.gte = vi.fn(chain);
      builder.order = vi.fn(chain);
      builder.range = vi.fn(chain);
      builder.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
        if (h.error) return Promise.resolve({ data: null, error: h.error }).then(onFulfilled, onRejected);
        return Promise.resolve({ data: h.rows, error: null }).then(onFulfilled, onRejected);
      };
      return builder;
    },
  },
}));

import { useSLAHistory } from '@/hooks/sla/useSLAHistory';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

/** Linha de conversation_sla com os campos de resolução variando. */
const linha = (
  id: string,
  resolution: { breached?: boolean | null; resolvedAt?: string | null } = {}
): Record<string, unknown> => ({
  id,
  created_at: new Date().toISOString(),
  first_response_at: new Date().toISOString(),
  first_response_breached: false,
  resolution_breached: resolution.breached ?? false,
  // Sem `resolvedAt` explícito a linha está resolvida; `resolvedAt: null` é a pendente.
  resolved_at: resolution.resolvedAt === undefined ? new Date().toISOString() : resolution.resolvedAt,
});

describe('useSLAHistory — resolução', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rows = [];
    h.error = null;
  });

  it('a série diária traz a taxa de resolução e deixa a pendente fora da conta', async () => {
    h.rows = [
      linha('r1', {}), // resolvida no prazo
      linha('r2', {}), // resolvida no prazo
      linha('r3', { breached: true }), // violada
      linha('r4', { resolvedAt: null }), // pendente — não conta
    ];

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const hoje = format(new Date(), 'yyyy-MM-dd');
    const dia = result.current.data!.dailyData.find((d) => d.date === hoje)!;

    expect(dia.resolutionEvaluated).toBe(3);
    expect(dia.resolutionBreaches).toBe(1);
    expect(dia.resolutionPending).toBe(1);
    // 2 no prazo de 3 avaliadas = 66,67% (a pendente NÃO entra como no prazo)
    expect(dia.resolutionRate).toBeCloseTo(66.67, 1);

    // Total de 1ª resposta intacto (todas as 4 linhas têm 1ª resposta no prazo).
    expect(result.current.data!.totals.firstResponseBreaches).toBe(0);
    expect(result.current.data!.totals.resolutionEvaluated).toBe(3);
    expect(result.current.data!.totals.resolutionBreaches).toBe(1);
    expect(result.current.data!.totals.resolutionPending).toBe(1);
  });

  it('dia só com pendentes fica com taxa 0 (nunca 100)', async () => {
    h.rows = [linha('r1', { resolvedAt: null })];

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const hoje = format(new Date(), 'yyyy-MM-dd');
    const dia = result.current.data!.dailyData.find((d) => d.date === hoje)!;

    expect(dia.resolutionEvaluated).toBe(0);
    expect(dia.resolutionRate).toBe(0);
  });
});
