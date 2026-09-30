import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Contatos mudam fora da tela (inbox, nova conversa, servidor). Ao voltar para
 * Contatos DENTRO do staleTime, os agregados precisam revalidar — senão
 * Total/Fornecedores/abas/KPIs mostram números velhos.
 */
const mocks = vi.hoisted(() => ({
  kpiFetches: 0,
  getCountsByType: vi.fn(async () => ({ data: [{ contact_type: 'cliente', count: 1 }], error: null })),
  searchContacts: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => {
        mocks.kpiFetches++;
        const result = Promise.resolve({ data: [], error: null });
        return Object.assign(result, { eq: () => result });
      },
    }),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));

vi.mock('@/services/contact.service', () => ({
  ContactService: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'getCountsByType') return mocks.getCountsByType;
      if (prop === 'searchContacts') return mocks.searchContacts;
      return vi.fn(async () => ({ data: [], error: null }));
    },
  }),
}));

import { useContactsKpi } from '../useContactsKpi';
import { useContactsSearch } from '../useContactsSearch';

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('agregados de Contatos revalidam ao remontar a tela', () => {
  let qc: QueryClient;
  beforeEach(() => {
    // Mesmos defaults do app (src/lib/queryClient.ts): staleTime 5min e
    // refetchOnMount false — sem o override, NADA revalida ao remontar.
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 1000 * 60 * 5, refetchOnMount: false } },
    });
    mocks.kpiFetches = 0;
    mocks.getCountsByType.mockClear();
    mocks.searchContacts.mockClear();
  });

  it('KPIs buscam de novo ao remontar dentro do staleTime', async () => {
    const first = renderHook(() => useContactsKpi(false), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    renderHook(() => useContactsKpi(false), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(mocks.kpiFetches).toBe(2));
  });

  it('contadores por tipo buscam de novo ao remontar dentro do staleTime', async () => {
    const first = renderHook(() => useContactsSearch(), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(mocks.getCountsByType).toHaveBeenCalledTimes(1));
    first.unmount();

    renderHook(() => useContactsSearch(), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(mocks.getCountsByType).toHaveBeenCalledTimes(2));
  });

  it('lista (contacts-search) busca de novo ao remontar, junto com os contadores', async () => {
    const first = renderHook(() => useContactsSearch(), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(mocks.searchContacts).toHaveBeenCalledTimes(1));
    first.unmount();

    renderHook(() => useContactsSearch(), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(mocks.searchContacts).toHaveBeenCalledTimes(2));
  });
});
