import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock supabase: o handleToggleActive só grava `profiles.is_active` (a revogação
// real é o trigger server-side `trg_revoke_sessions_on_profile_deactivate`).
// `functions.invoke` NÃO deve ser chamado por essa ação administrativa.
//
// IMPORTANTE: `eq` aponta direto para `mockEq` (sem `.mockResolvedValue` dentro
// do corpo do factory). Se o factory reexecutar `mockEq.mockResolvedValue(...)`
// a cada chamada de `from()`, ele sobrescreve a implementação definida por teste
// (erro/reentrada) e o teste perde o controle do mock.
const { mockUpdate, mockEq, mockInvoke } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockInvoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      update: mockUpdate.mockReturnValue({ eq: mockEq }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    functions: { invoke: mockInvoke },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useAdminData, type UserWithRole } from '@/components/admin/useAdminData';
import { toast } from 'sonner';

function makeUser(overrides: Partial<UserWithRole> = {}): UserWithRole {
  return {
    id: 'prof-1',
    user_id: 'auth-1',
    name: 'Test User',
    email: 'test@test.com',
    avatar_url: null,
    nickname: null,
    signature: null,
    role: 'agent',
    job_title: null,
    department: null,
    phone: null,
    access_level: 'basic',
    max_chats: 5,
    can_download: true,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('useAdminData.handleToggleActive — revogação via contrato backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
  });

  it('ao desativar grava is_active=false e NÃO invoca a Edge Function (a revogação é do trigger server-side)', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.handleToggleActive(makeUser({ is_active: true }));
    });

    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
    expect(mockInvoke).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ao reativar grava is_active=true e não cria sessão nem dispara revogação', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.handleToggleActive(makeUser({ is_active: false }));
    });

    expect(mockUpdate).toHaveBeenCalledWith({ is_active: true });
    expect(mockInvoke).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('trata erro de gravação sem anunciar sucesso', async () => {
    mockEq.mockResolvedValue({ error: { message: 'rls denied' } });
    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.handleToggleActive(makeUser({ is_active: true }));
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reentrada (duplo clique) do mesmo usuário não duplica a gravação', async () => {
    let resolveEq: (value: unknown) => void;
    mockEq.mockImplementation(() => new Promise((resolve) => { resolveEq = resolve; }));

    const { result } = renderHook(() => useAdminData('users'));
    const user = makeUser({ is_active: true });

    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    act(() => {
      first = result.current.handleToggleActive(user);
      second = result.current.handleToggleActive(user);
    });

    await act(async () => {
      resolveEq!({ error: null });
      await Promise.all([first, second]);
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
