import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { mfa: { listFactors: vi.fn() } } },
}));

import { supabase } from '@/integrations/supabase/client';
import { MFA_TOTP_QUERY_KEY, useHasVerifiedTotp, useMfaFactors } from '@/hooks/auth/useMFA';

// R2-AUTH-024: a UI de segurança precisa de UMA fonte compartilhada dos fatores
// que distinga carregando, erro e "nenhum fator" — antes cada tela criava a sua
// instância de useMFA e nunca buscava nada.

const listFactors = supabase.auth.mfa.listFactors as unknown as Mock;
const verified = { id: 'f1', factor_type: 'totp' as const, status: 'verified' as const };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useMfaFactors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFactors.mockResolvedValue({ data: { totp: [], phone: [] }, error: null });
  });

  it('devolve os fatores na chave compartilhada quando a leitura conclui', async () => {
    listFactors.mockResolvedValue({ data: { totp: [verified], phone: [] }, error: null });
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useMfaFactors(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    // mesma chave usada pelos outros consumidores da tela = fonte compartilhada
    expect(client.getQueryData(MFA_TOTP_QUERY_KEY)).toEqual([verified]);
  });

  it('lista vazia é sucesso (zero fatores), não erro', async () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useMfaFactors(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(result.current.isError).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('falha na leitura vira isError com data indefinida — nunca lista vazia', async () => {
    listFactors.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { wrapper } = setup();

    const { result } = renderHook(() => useMfaFactors(true), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('useHasVerifiedTotp deriva da mesma fonte: true com fator, undefined no erro', async () => {
    listFactors.mockResolvedValue({ data: { totp: [verified], phone: [] }, error: null });
    const ok = setup();
    const first = renderHook(() => useHasVerifiedTotp(true), { wrapper: ok.wrapper });
    await waitFor(() => expect(first.result.current.data).toBe(true));

    listFactors.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const failing = setup();
    const second = renderHook(() => useHasVerifiedTotp(true), { wrapper: failing.wrapper });
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    expect(second.result.current.data).toBeUndefined();
  });
});
