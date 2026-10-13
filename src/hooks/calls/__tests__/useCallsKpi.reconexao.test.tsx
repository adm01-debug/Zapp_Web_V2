import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpc = vi.fn(async () => ({ data: [{ total: 7 }], error: null }));

const canal = { on: vi.fn(() => canal), subscribe: vi.fn(() => canal) };
const channel = vi.fn((_nome: string) => canal);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...(args as [])),
    channel: (...args: unknown[]) => channel(...(args as [string])),
    removeChannel: vi.fn(),
  },
}));

import { useCallsKpi } from '@/hooks/calls/useCallsKpi';

function envolver(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useCallsKpi — reconexão', () => {
  beforeEach(() => {
    rpc.mockClear();
    canal.on.mockClear();
    canal.subscribe.mockClear();
    channel.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revalida os KPIs quando a rede volta, sem depender de um evento novo', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useCallsKpi({ period: 'hoje', channel: 'all', scope: 'mine' }), {
      wrapper: envolver(client),
    });

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    act(() => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  });

  it('usa tópico exclusivo por instância (dois consumidores não se derrubam)', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = envolver(client);
    renderHook(() => useCallsKpi({ period: 'hoje', channel: 'all', scope: 'mine' }), { wrapper });
    renderHook(() => useCallsKpi({ period: 'hoje', channel: 'all', scope: 'mine' }), { wrapper });

    const topicos = channel.mock.calls.map(([nome]) => nome as string);
    expect(topicos).toHaveLength(2);
    expect(topicos[0]).toMatch(/^calls-kpi-realtime:/);
    expect(topicos[0]).not.toBe(topicos[1]);
  });
});
