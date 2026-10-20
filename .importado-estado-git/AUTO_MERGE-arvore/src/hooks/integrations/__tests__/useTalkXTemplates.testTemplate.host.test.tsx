import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPABASE_URL } from '@/config/supabase';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession } },
}));

// A listagem de templates não é o objeto deste teste: responde vazio.
vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const encadeavel: Record<string, unknown> = {};
    const mesmo = () => encadeavel;
    Object.assign(encadeavel, {
      select: mesmo,
      order: mesmo,
      eq: mesmo,
      limit: mesmo,
      then: (resolver: (valor: unknown) => unknown) => resolver({ data: [], error: null }),
    });
    return encadeavel;
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'perfil-teste' } }),
}));

import { useTalkXTemplates } from '../useTalkXTemplates';

const HOST_INTRUSO = 'https://projeto-interno.supabase.co';
const TOKEN_SINTETICO = 'jwt-sintetico-de-teste';

function criarWrapper() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
}

describe('SEC-FE-01 — testTemplate manda o JWT só para o host canônico', () => {
  beforeEach(() => {
    // É o que a hospedagem faz hoje: injeta a variável apontando para outro projeto.
    vi.stubEnv('VITE_SUPABASE_URL', HOST_INTRUSO);
    getSession.mockResolvedValue({ data: { session: { access_token: TOKEN_SINTETICO } } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('usa SUPABASE_URL do config e nunca o host da variável de ambiente', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTalkXTemplates(), { wrapper: criarWrapper() });
    await waitFor(() => expect(result.current.testTemplate).toBeTypeOf('function'));

    await result.current.testTemplate({ templateContent: 'Olá', phone: '+5511999999999' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // O destino é o host do config (@/config/supabase), não o da variável de ambiente.
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/talkx-send`);
    expect(url).not.toContain('projeto-interno');
    // O uso legítimo continua: POST, token da sessão e corpo do teste intactos.
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN_SINTETICO}`);
    expect(JSON.parse(init.body as string)).toMatchObject({
      action: 'test',
      templateContent: 'Olá',
      phone: '+5511999999999',
    });
  });
});
