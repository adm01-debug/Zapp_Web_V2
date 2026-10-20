import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => h.rpc(...args) },
}));

import { useBusinessHoursCheck } from '@/hooks/business/useBusinessHoursCheck';

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
});

describe('useBusinessHoursCheck', () => {
  it('sucesso devolve o booleano da RPC', async () => {
    h.rpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => useBusinessHoursCheck('conn-1'), { wrapper: wrapperFor(makeClient()) });

    await waitFor(() => expect(result.current.data).toBe(true));
    expect(h.rpc).toHaveBeenCalledWith('is_within_business_hours', { connection_id: 'conn-1' });
    expect(result.current.isError).toBe(false);
  });

  it('erro da RPC vira isError, NÃO "sem dado"', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'function is_within_business_hours does not exist' } });

    const { result } = renderHook(() => useBusinessHoursCheck('conn-1'), { wrapper: wrapperFor(makeClient()) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('sem connectionId não chama a RPC', () => {
    const { result } = renderHook(() => useBusinessHoursCheck(undefined), { wrapper: wrapperFor(makeClient()) });

    expect(h.rpc).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
  });
});
