import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_SIZE, useMyCalls } from '../useMyCalls';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const base = { page: 1, period: '7d', channel: 'all', direction: 'all', result: 'all', q: '', scope: 'mine' };

describe('useMyCalls (T45)', () => {
  beforeEach(() => rpc.mockReset());

  it('pagina no servidor: pagina 2 pede offset diferente da pagina 1', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const p1 = renderHook(() => useMyCalls({ ...base, page: 1 }), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const args1 = rpc.mock.calls[0][1] as Record<string, number>;

    rpc.mockClear();
    const p2 = renderHook(() => useMyCalls({ ...base, page: 2 }), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const args2 = rpc.mock.calls[0][1] as Record<string, number>;

    expect(args1.p_offset).toBe(0);
    expect(args2.p_offset).toBe(PAGE_SIZE);
    expect(args1.p_offset).not.toBe(args2.p_offset);
    p1.unmount();
    p2.unmount();
  });

  it('deriva total e paginas do total_count do servidor', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a', total_count: 37 }], error: null });
    const { result } = renderHook(() => useMyCalls(base), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(37));
    expect(result.current.pages).toBe(Math.ceil(37 / PAGE_SIZE));
  });

  it('prefixa p_ nos parametros que a RPC espera', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useMyCalls({ ...base, channel: 'whatsapp', result: 'missed', q: 'ana' }), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const [nome, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nome).toBe('search_my_calls');
    expect(args.p_channel).toBe('whatsapp');
    expect(args.p_result).toBe('missed');
    expect(args.p_q).toBe('ana');
    expect(args.p_limit).toBe(PAGE_SIZE);
  });

  it('pagina fora do intervalo volta para a 1', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a', total_count: 3 }], error: null });
    const { result } = renderHook(() => useMyCalls({ ...base, page: 9 }), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(result.current.pages).toBe(1);
    expect(result.current.page).toBe(1);
    expect(result.current.paginaForaDoIntervalo).toBe(true);
  });
});
