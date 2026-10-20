import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { format, startOfDay, subDays } from 'date-fns';

/**
 * Dublê do PostgREST: registra os filtros aplicados (`.gte`, `.range`) e devolve as páginas
 * pedidas. Sem `.range()` a leitura para no teto de linhas do projeto (1000), como no servidor.
 */
const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  gte: [] as Array<{ table: string; column: string; value: string }>,
  ranges: [] as Array<{ table: string; from: number; to: number }>,
}));

/** Teto de linhas do PostgREST no projeto (achado A6/A11). */
const TETO_POSTGREST = 1000;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = vi.fn(chain);
      builder.gte = vi.fn((column: string, value: string) => {
        h.gte.push({ table, column, value });
        return builder;
      });
      builder.order = vi.fn(chain);
      builder.range = vi.fn((from: number, to: number) => {
        h.ranges.push({ table, from, to });
        return builder;
      });
      builder.then = (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => {
        if (h.error) {
          return Promise.resolve({ data: null, error: h.error }).then(onFulfilled, onRejected);
        }
        const filtros = h.gte.filter((f) => f.table === table);
        const filtradas = h.rows.filter((row) =>
          filtros.every((f) => {
            const valor = row[f.column];
            return typeof valor === 'string' && valor >= f.value;
          })
        );
        const range = [...h.ranges].reverse().find((r) => r.table === table);
        const pagina = range
          ? filtradas.slice(range.from, range.to + 1)
          : filtradas.slice(0, TETO_POSTGREST);
        return Promise.resolve({ data: pagina, error: null }).then(onFulfilled, onRejected);
      };
      return builder;
    },
  },
}));

import { useSLAHistory } from '@/hooks/sla/useSLAHistory';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

/** Chave do dia civil do processo (mesmo eixo que o recorte da janela). */
const dia = (valor: Date) => format(valor, 'yyyy-MM-dd');

const registro = (createdAt: Date, breached = false): Record<string, unknown> => ({
  id: `r-${createdAt.toISOString()}`,
  created_at: createdAt.toISOString(),
  first_response_breached: breached,
});

const gteDeSla = () => h.gte.filter((f) => f.table === 'conversation_sla');

describe('useSLAHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rows = [];
    h.error = null;
    h.gte = [];
    h.ranges = [];
  });

  it('initializes with loading state', () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(true);
  });

  it('fetches data for 7d period', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeDefined();
  });

  it('fetches data for 30d period', async () => {
    const { result } = renderHook(() => useSLAHistory('30d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('fetches data for 90d period', async () => {
    const { result } = renderHook(() => useSLAHistory('90d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('handles empty data gracefully', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.totals.totalBreaches).toBe(0);
    expect(result.current.data?.totals.overallSLARate).toBeDefined();
  });

  it('handles SLA records with breaches', async () => {
    const now = new Date();
    h.rows = [
      registro(now, true),
      registro(new Date(now.getTime() - 1_000), true),
    ];

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Só SLA de 1ª resposta conta agora (resolution_breached é ignorado)
    expect(result.current.data?.totals.firstResponseBreaches).toBe(2);
    expect(result.current.data?.totals.totalBreaches).toBe(2);
  });

  it('handles fetch error gracefully', async () => {
    h.error = { message: 'DB error' };

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    // With useQuery + retry:false, it will error; data stays null
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it('data contains dailyData array', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Array.isArray(result.current.data?.dailyData)).toBe(true);
    expect(result.current.data!.dailyData.length).toBeGreaterThan(0);
  });

  it('data contains trends', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.trends).toBeDefined();
    expect(result.current.data?.trends.overall).toBeDefined();
  });

  it('defaults to 30d when no period provided', async () => {
    const { result } = renderHook(() => useSLAHistory(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeDefined();
  });

  // ------------------------------------------------------------------
  // R2-SLA-002 — o rótulo "7 dias" promete 7 datas civis (hoje + 6 anteriores)
  // ------------------------------------------------------------------

  it('"7 dias" cobre exatamente 7 datas civis, da mais antiga até hoje', async () => {
    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const dias = result.current.data!.dailyData;
    // Vermelho antes: o recorte partia de `subDays(now, 7)` e a série tinha 8 datas.
    expect(dias).toHaveLength(7);
    expect(dias[0].date).toBe(dia(startOfDay(subDays(new Date(), 6))));
    expect(dias[dias.length - 1].date).toBe(dia(startOfDay(new Date())));
    expect(gteDeSla()[0].value).toBe(startOfDay(subDays(new Date(), 6)).toISOString());
  });

  it.each([14, 30, 90])('a janela de %id também tem N datas civis (sem o dia extra)', async (dias) => {
    const { result } = renderHook(() => useSLAHistory(`${dias}d` as '14d' | '30d' | '90d'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const serie = result.current.data!.dailyData;
    expect(serie).toHaveLength(dias);
    expect(serie[0].date).toBe(dia(startOfDay(subDays(new Date(), dias - 1))));
  });

  it('o 8º dia não entra: registro de 7 dias atrás fica fora do total de "7 dias"', async () => {
    const oitavoDia = startOfDay(subDays(new Date(), 7));
    h.rows = [registro(oitavoDia)];

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data!.dailyData.map((d) => d.date)).not.toContain(dia(oitavoDia));
    expect(result.current.data!.totals.totalConversations).toBe(0);
  });

  it('a janela é de dia civil: registro às 23h30 do 1º dia entra no 1º dia', async () => {
    const primeiroDia = startOfDay(subDays(new Date(), 6));
    const vinte3h30 = new Date(primeiroDia.getTime() + 23 * 3_600_000 + 30 * 60_000);
    h.rows = [registro(vinte3h30, true)];

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const serie = result.current.data!.dailyData;
    expect(serie[0].date).toBe(dia(primeiroDia));
    expect(serie[0].totalConversations).toBe(1);
    expect(serie[1].totalConversations).toBe(0);
    expect(result.current.data!.totals.totalConversations).toBe(1);
  });

  it('conta o período inteiro mesmo acima do teto de linhas do PostgREST', async () => {
    const agora = new Date();
    h.rows = Array.from({ length: 1500 }, (_, i) =>
      registro(new Date(agora.getTime() - i * 1_000))
    );

    const { result } = renderHook(() => useSLAHistory('7d'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Vermelho antes: sem `.range()` o servidor devolvia só a primeira página (1000 linhas).
    expect(result.current.data!.totals.totalConversations).toBe(1500);
    expect(h.ranges.some((r) => r.from === 1000)).toBe(true);
  });
});
