import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockUpdate = vi.fn();
const mockEqUpdate = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://proj.supabase.co',
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
        getPublicUrl: vi.fn(),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/avatar.jpg' } }),
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
import { supabase } from '@/integrations/supabase/client';
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

describe('useAdminData — avatares no bucket privado', () => {
  const storageFrom = supabase.storage.from as unknown as ReturnType<typeof vi.fn>;
  const tableFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
  const createSignedUrl = vi.fn();
  const getPublicUrl = vi.fn();
  const upload = vi.fn();
  let lastUpdate: Record<string, unknown> | null = null;

  const profileRow = {
    id: 'user-1',
    user_id: 'auth-1',
    name: 'Test User',
    email: 'test@test.com',
    avatar_url: 'auth-1/avatar.png',
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
  };

  const buildUser = (avatar_url: string | null): UserWithRole => ({
    id: 'user-1', user_id: 'auth-1', name: 'Test User', email: 'test@test.com',
    avatar_url, nickname: null, signature: null, role: 'agent', job_title: null,
    department: null, phone: null, access_level: 'basic', max_chats: 5,
    can_download: true, is_active: true, created_at: new Date().toISOString(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    lastUpdate = null;
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/avatar.png' }, error: null });
    upload.mockResolvedValue({ error: null });
    storageFrom.mockReturnValue({ upload, getPublicUrl, createSignedUrl });
    tableFrom.mockImplementation((table: string) => ({
      select: () => {
        const result = {
          data: table === 'profiles' ? [profileRow] : [{ user_id: 'auth-1', role: 'agent' }],
          error: null,
        };
        const thenable = Promise.resolve(result) as Promise<typeof result> & {
          order: () => Promise<typeof result>;
          in: () => Promise<{ data: unknown[]; error: null }>;
          single: () => Promise<typeof result>;
        };
        thenable.order = async () => result;
        thenable.in = async () => ({ data: [], error: null });
        thenable.single = async () => result;
        return thenable;
      },
      update: (payload: Record<string, unknown>) => {
        lastUpdate = payload;
        return { eq: async () => ({ error: null }) };
      },
      insert: async () => ({ data: null, error: null }),
    }));
  });

  it('assina o caminho guardado ao carregar usuários (bucket privado)', async () => {
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.fetchData();
    });

    expect(createSignedUrl).toHaveBeenCalledWith('auth-1/avatar.png', 300);
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect(result.current.users[0].avatar_url).toBe('https://signed.example.com/avatar.png');
  });

  it('upload de avatar pelo admin grava o caminho, não a URL', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    await act(async () => {
      await result.current.handleSaveUser(buildUser(null), file);
    });

    expect(upload).toHaveBeenCalled();
    expect(lastUpdate?.avatar_url).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('salvar sem trocar a foto persiste o caminho, não a URL assinada', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    const signed = 'https://proj.supabase.co/storage/v1/object/sign/avatars/auth-1/avatar.png?token=abc';

    await act(async () => {
      await result.current.handleSaveUser(buildUser(signed), null);
    });

    expect(lastUpdate?.avatar_url).toBe('auth-1/avatar.png');
  });

  it('remover o avatar grava null (não sobra URL pública)', async () => {
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.handleSaveUser(buildUser(null), null);
    });

    expect(lastUpdate?.avatar_url).toBeNull();
  });
});
