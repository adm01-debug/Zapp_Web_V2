import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  filters: [] as Array<[string, unknown]>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: (...args: unknown[]) => h.from(...args),
  },
}));

import {
  useBusinessHoursCheck,
  getSaoPauloDayOfWeek,
} from '@/hooks/business/useBusinessHoursCheck';

interface Builder {
  select: () => Builder;
  eq: (column: string, value: unknown) => Builder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
}

/** Cadeia de leitura da tabela business_hours: select().eq().eq().maybeSingle(). */
function makeBuilder(result: { data: unknown; error: unknown }): Builder {
  const builder: Builder = {
    select: () => builder,
    eq: (column, value) => {
      h.filters.push([column, value]);
      return builder;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.filters.length = 0;
});

describe('getSaoPauloDayOfWeek', () => {
  it('usa o fuso America/Sao_Paulo, não o do navegador (0=domingo)', () => {
    // 15/10/2026 02:00 UTC = 14/10/2026 23:00 em São Paulo (quarta-feira).
    expect(getSaoPauloDayOfWeek(new Date('2026-10-15T02:00:00Z'))).toBe(3);
    // 15/10/2026 15:00 UTC = 15/10/2026 12:00 em São Paulo (quinta-feira).
    expect(getSaoPauloDayOfWeek(new Date('2026-10-15T15:00:00Z'))).toBe(4);
  });
});

describe('useBusinessHoursCheck', () => {
  it('aberto: há horário para hoje e a RPC devolve true', async () => {
    h.from.mockReturnValue(makeBuilder({ data: { id: 'bh-1' }, error: null }));
    h.rpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => useBusinessHoursCheck('conn-1'), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.data).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(h.rpc).toHaveBeenCalledWith('is_within_business_hours', { connection_id: 'conn-1' });
    expect(h.from).toHaveBeenCalledWith('business_hours');
    expect(h.filters).toEqual([
      ['whatsapp_connection_id', 'conn-1'],
      ['day_of_week', getSaoPauloDayOfWeek()],
    ]);
  });

  it('fechado: há horário para hoje e a RPC devolve false', async () => {
    h.from.mockReturnValue(makeBuilder({ data: { id: 'bh-1' }, error: null }));
    h.rpc.mockResolvedValue({ data: false, error: null });

    const { result } = renderHook(() => useBusinessHoursCheck('conn-1'), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.data).toBe(false));
    expect(result.current.isError).toBe(false);
  });

  it('sem horário configurado para hoje: devolve null (nunca "aberto") e não chama a RPC', async () => {
    // A RPC devolve true quando não há linha — é justamente o caso que mentia "Aberto".
    h.from.mockReturnValue(makeBuilder({ data: null, error: null }));
    h.rpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => useBusinessHoursCheck('conn-1'), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('erro da RPC vira isError, NÃO "sem dado"', async () => {
    h.from.mockReturnValue(makeBuilder({ data: { id: 'bh-1' }, error: null }));
    h.rpc.mockResolvedValue({
      data: null,
      error: { message: 'function is_within_business_hours does not exist' },
    });

    const { result } = renderHook(() => useBusinessHoursCheck('conn-1'), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('erro ao ler business_hours vira isError, NÃO "sem configuração"', async () => {
    h.from.mockReturnValue(makeBuilder({ data: null, error: { message: 'permission denied' } }));

    const { result } = renderHook(() => useBusinessHoursCheck('conn-1'), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('sem connectionId não lê a tabela nem chama a RPC', () => {
    const { result } = renderHook(() => useBusinessHoursCheck(undefined), {
      wrapper: wrapperFor(makeClient()),
    });

    expect(h.from).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
  });
});
