import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fronteira dublada é o SDK do Supabase (sessão) — não o sujeito. O módulo de
// produção lê a sessão real via `supabase.auth.getSession()`; aqui devolvemos a
// sessão para provar que o bearer sai dela (e não da anon key) quando existe.
const { getSession, ANON } = vi.hoisted(() => ({ getSession: vi.fn(), ANON: 'anon-key-de-teste' }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: () => getSession() } },
  SUPABASE_ANON_KEY: ANON,
}));

import { edgeAuthHeaders } from '../edgeAuthHeaders';

describe('edgeAuthHeaders', () => {
  beforeEach(() => getSession.mockReset());

  it('usa o access_token da sessão como bearer e a anon key como apikey', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'sessao-token' } } });

    await expect(edgeAuthHeaders()).resolves.toEqual({
      apikey: ANON,
      Authorization: `Bearer sessao-token`,
    });
  });

  it('cai para a anon key quando não há sessão (a edge devolve 401)', async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(edgeAuthHeaders()).resolves.toEqual({
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    });
  });
});
