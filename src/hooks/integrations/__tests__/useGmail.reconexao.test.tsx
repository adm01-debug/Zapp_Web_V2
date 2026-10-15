import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

vi.mock('@/hooks/gmail/gmailApi');

vi.mock('@/lib/gmailOAuth', () => ({
  createGmailOAuthState: vi.fn(() => 'state-abc'),
  storeGmailOAuthReturnContext: vi.fn(),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({
  RESERVED_HASHES: new Set(['main-content', 'main-navigation', 'inbox-section', 'search-input']),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { from, callGmailFunction } = vi.hoisted(() => {
  const conta = {
    id: 'acc1',
    email_address: 'user@example.com',
    is_active: true,
    sync_status: 'synced',
    last_sync_at: null,
    last_error: null,
    created_at: '2024-01-01T00:00:00Z',
  };
  const fimLista = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
  const cadeia = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: fimLista,
    range: fimLista,
    contains: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const from = vi.fn((_tabela: string) => cadeia);
  const callGmailFunction = vi.fn(async () => ({ accounts: [conta] }));
  return { from, callGmailFunction };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: (...args: unknown[]) => from(...(args as [string])),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

import * as gmailApi from '@/hooks/gmail/gmailApi';
import { useGmail } from '@/hooks/integrations/useGmail';

function envolver(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useGmail — reconexão', () => {
  beforeEach(() => {
    from.mockClear();
    callGmailFunction.mockClear();
    vi.mocked(gmailApi.callGmailFunction).mockImplementation(callGmailFunction);
  });

  it('revalida threads e contagens quando a rede volta, sem depender de um evento novo', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useGmail(), { wrapper: envolver(client) });

    const chamadasThreads = () =>
      from.mock.calls.filter(([tabela]) => tabela === 'email_threads').length;

    // Carga inicial com 1 conta ativa: lista de threads + contagem de não lidas.
    await waitFor(() => expect(chamadasThreads()).toBe(2));

    act(() => { window.dispatchEvent(new Event('online')); });

    // invalidateThreadData invalida ['gmail-threads'] e ['gmail-thread-counts']:
    // as duas consultas rodam de novo sem nenhum evento no canal.
    await waitFor(() => expect(chamadasThreads()).toBe(4));
  });
});
