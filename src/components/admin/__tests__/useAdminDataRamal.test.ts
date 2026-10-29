import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * PE-104/105 — contrato do provisionamento da credencial SIP pelo Admin.
 *
 * Prova que `handleSaveRamal` chama a RPC atômica `set_voip_profile_credentials`
 * com os nomes de parâmetro que a migration espera (p_profile_id, p_ramal,
 * p_sip_password) e traduz os erros de negócio (ramal_em_uso etc.) em mensagem
 * pt-BR — sem anunciar sucesso quando o banco recusa.
 *
 * Mock do supabase no mesmo formato de useAdminDataToggleActive.test.ts.
 */
const { mockRpc, mockUpdate, mockEq } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      update: mockUpdate.mockReturnValue({ eq: mockEq }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useAdminData } from '@/components/admin/useAdminData';
import { toast } from 'sonner';

describe('useAdminData.handleSaveRamal — provisiona a credencial SIP pela RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('chama set_voip_profile_credentials com p_profile_id, p_ramal e p_sip_password', async () => {
    const { result } = renderHook(() => useAdminData('users'));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSaveRamal('prof-1', '2001', 'segredo-sip');
    });

    expect(mockRpc).toHaveBeenCalledWith('set_voip_profile_credentials', {
      p_profile_id: 'prof-1',
      p_ramal: '2001',
      p_sip_password: 'segredo-sip',
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('traduz o erro de ramal em uso e NÃO anuncia sucesso', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'ramal_em_uso' } });
    const { result } = renderHook(() => useAdminData('users'));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSaveRamal('prof-1', '2001', 'segredo-sip');
    });

    expect(ok).toBe(false);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Este ramal já está em uso por outro atendente.'),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('traduz erro de permissão (not_authorized) para o admin', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.handleSaveRamal('prof-1', '2001', 'segredo-sip');
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Apenas administradores podem definir o ramal.'),
    );
  });
});
