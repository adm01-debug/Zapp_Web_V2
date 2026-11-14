import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * `IncomingCallAlert` (dono do `useCallChannels`) é montado globalmente, também
 * na tela de login. Sem sessão a consulta a `whatsapp_connections` voltava 401
 * no console de produção. Sem usuário o hook não consulta; ao logar, consulta.
 */
const { mockFrom, authState } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  authState: { user: null as { id: string } | null },
}));

function consultaQueResolve(data: unknown[] = []) {
  const builder = {
    select: vi.fn(() => builder),
    not: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data, error: null })),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data, error: null }),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mockFrom } }));
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({ sipStatus: 'idle', sipReason: null, micReason: null }),
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: authState.user }) }));

import { useCallChannels } from '../useCallChannels';

const tabelasConsultadas = () => mockFrom.mock.calls.map(([tabela]) => tabela as string);

describe('useCallChannels — sem usuário logado', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockFrom.mockImplementation(() => consultaQueResolve());
    authState.user = null;
  });

  it('sem usuário não consulta whatsapp_connections', async () => {
    const { result } = renderHook(() => useCallChannels());
    await act(async () => { await Promise.resolve(); });

    expect(tabelasConsultadas()).not.toContain('whatsapp_connections');
    expect(result.current.whatsapp.canReceive).toBe(false);
  });

  it('ao logar, consulta whatsapp_connections uma vez', async () => {
    const { rerender } = renderHook(() => useCallChannels());
    await act(async () => { await Promise.resolve(); });
    expect(tabelasConsultadas()).not.toContain('whatsapp_connections');

    authState.user = { id: 'user-1' };
    await act(async () => { rerender(); await Promise.resolve(); });

    expect(tabelasConsultadas().filter((t) => t === 'whatsapp_connections')).toHaveLength(1);
  });

  it('renovação de token (mesmo id, objeto novo) não refaz a consulta', async () => {
    authState.user = { id: 'user-1' };
    const { rerender } = renderHook(() => useCallChannels());
    await act(async () => { await Promise.resolve(); });
    authState.user = { id: 'user-1' }; // TOKEN_REFRESHED: referência nova, mesmo usuário
    await act(async () => { rerender(); await Promise.resolve(); });

    expect(tabelasConsultadas().filter((t) => t === 'whatsapp_connections')).toHaveLength(1);
  });
});
