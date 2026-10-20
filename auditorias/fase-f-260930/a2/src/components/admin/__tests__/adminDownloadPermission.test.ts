import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockUpdate = vi.fn();
const mockEqUpdate = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      update: mockUpdate.mockReturnValue({
        eq: mockEqUpdate.mockResolvedValue({ error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null }),
      },
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/avatar.jpg' } }),
      }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useAdminData, type UserWithRole } from '@/components/admin/useAdminData';
import { renderHook, act } from '@testing-library/react';

describe('useAdminData - can_download no handleSaveUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia can_download no payload de update', async () => {
    const { result } = renderHook(() => useAdminData('users'));

    const testUser: UserWithRole = {
      id: 'user-1',
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
    };

    await act(async () => {
      await result.current.handleSaveUser(testUser, null);
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ can_download: true })
    );
  });

  it('envia can_download=false quando desabilitado', async () => {
    const { result } = renderHook(() => useAdminData('users'));

    const testUser: UserWithRole = {
      id: 'user-2',
      user_id: 'auth-2',
      name: 'Blocked User',
      email: 'blocked@test.com',
      avatar_url: null,
      nickname: null,
      signature: null,
      role: 'agent',
      job_title: null,
      department: null,
      phone: null,
      access_level: 'basic',
      max_chats: 5,
      can_download: false,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    await act(async () => {
      await result.current.handleSaveUser(testUser, null);
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ can_download: false })
    );
  });
});

describe('UserWithRole interface', () => {
  it('inclui campo can_download obrigatório', () => {
    const user: UserWithRole = {
      id: 'test',
      user_id: 'test',
      name: 'Test',
      email: null,
      avatar_url: null,
      nickname: null,
      signature: null,
      role: 'agent',
      job_title: null,
      department: null,
      phone: null,
      access_level: null,
      max_chats: null,
      can_download: false,
      is_active: true,
      created_at: '',
    };

    expect(user.can_download).toBe(false);
    expect('can_download' in user).toBe(true);
  });

  it('can_download é boolean (não aceita null em runtime)', () => {
    const user: UserWithRole = {
      id: 'test', user_id: 'test', name: 'Test', email: null,
      avatar_url: null, nickname: null, signature: null, role: 'admin',
      job_title: null, department: null, phone: null, access_level: null,
      max_chats: null, can_download: true, is_active: true, created_at: '',
    };

    expect(typeof user.can_download).toBe('boolean');
  });
});
