import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * QA sweep (módulo admin, item CRITICAL #2): desativar usuário
 * (`profiles.is_active = false`) não tinha o mesmo piso de "não pode zerar o
 * último administrador" que a troca de role já tem via `admin_set_role`.
 * Como não existe RPC própria para desativação (o frontend grava
 * `profiles.is_active` direto; a revogação de sessão é do trigger
 * server-side), o piso é client-side: `handleToggleActive` recusa desativar
 * um admin quando ele é o único admin ATIVO na lista já carregada.
 */
const { mockUpdate, mockEq, mockFrom } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockFrom: vi.fn(),
}));

interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  nickname: string | null;
  signature: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  access_level: string | null;
  max_chats: number | null;
  can_download: boolean;
  is_active: boolean | null;
  created_at: string;
}

function makeProfile(overrides: Partial<ProfileRow>): ProfileRow {
  return {
    id: overrides.id ?? 'p-?',
    user_id: overrides.user_id ?? 'u-?',
    name: 'User',
    email: 'user@test.com',
    avatar_url: null,
    nickname: null,
    signature: null,
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

let profiles: ProfileRow[] = [];
let roles: { user_id: string; role: string }[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: profiles, error: null }),
          }),
          update: mockUpdate.mockReturnValue({ eq: mockEq }),
        };
      }
      if (table === 'user_roles') {
        return { select: vi.fn().mockResolvedValue({ data: roles, error: null }) };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    }),
    storage: { from: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useAdminData } from '@/components/admin/useAdminData';
import { toast } from 'sonner';

describe('useAdminData.handleToggleActive — piso do último admin ativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
    profiles = [];
    roles = [];
  });

  it('recusa desativar quando o usuário é o único admin ativo (bug original: não recusava)', async () => {
    profiles = [makeProfile({ id: 'p1', user_id: 'u1', name: 'Admin Único' })];
    roles = [{ user_id: 'u1', role: 'admin' }];

    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.fetchData();
    });
    const [admin] = result.current.users;
    expect(admin.role).toBe('admin');

    await act(async () => {
      await result.current.handleToggleActive(admin);
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('A instalação precisa de pelo menos um administrador ativo.')
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('permite desativar um admin quando existe outro admin ativo', async () => {
    profiles = [
      makeProfile({ id: 'p1', user_id: 'u1', name: 'Admin A' }),
      makeProfile({ id: 'p2', user_id: 'u2', name: 'Admin B' }),
    ];
    roles = [{ user_id: 'u1', role: 'admin' }, { user_id: 'u2', role: 'admin' }];

    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.fetchData();
    });
    const admin = result.current.users.find((u) => u.id === 'p1')!;

    await act(async () => {
      await result.current.handleToggleActive(admin);
    });

    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });

  it('não bloqueia desativar um admin já inativo (outro admin ativo cobre o piso) nem um não-admin', async () => {
    profiles = [
      makeProfile({ id: 'p1', user_id: 'u1', name: 'Admin Ativo' }),
      makeProfile({ id: 'p2', user_id: 'u2', name: 'Agente', is_active: true }),
    ];
    roles = [{ user_id: 'u1', role: 'admin' }, { user_id: 'u2', role: 'agent' }];

    const { result } = renderHook(() => useAdminData('users'));
    await act(async () => {
      await result.current.fetchData();
    });
    const agente = result.current.users.find((u) => u.id === 'p2')!;
    expect(agente.role).toBe('agent');

    await act(async () => {
      await result.current.handleToggleActive(agente);
    });

    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
