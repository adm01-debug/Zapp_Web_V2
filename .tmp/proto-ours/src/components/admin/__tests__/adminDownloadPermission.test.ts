import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { toast } from 'sonner';
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

  it('remoção real: usuário com avatar remove a foto e grava null', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    // Fluxo real da tela: o formulário parte do usuário COM avatar e limpa o campo.
    const edited: UserWithRole = { ...buildUser('auth-1/avatar.png'), avatar_url: null };

    await act(async () => {
      await result.current.handleSaveUser(edited, null);
    });

    expect(upload).not.toHaveBeenCalled();
    expect(lastUpdate?.avatar_url).toBeNull();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('normaliza URL pública legada ao carregar (bucket privado não quebra)', async () => {
    tableFrom.mockImplementation((table: string) => ({
      select: () => {
        const legacyRow = {
          ...profileRow,
          avatar_url: 'https://proj.supabase.co/storage/v1/object/public/avatars/auth-1/avatar.png?t=123',
        };
        const result = {
          data: table === 'profiles' ? [legacyRow] : [{ user_id: 'auth-1', role: 'agent' }],
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
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.fetchData();
    });

    // Assina o CAMINHO normalizado, nunca a URL http direto
    expect(createSignedUrl).toHaveBeenCalledWith('auth-1/avatar.png', 300);
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect(result.current.users[0].avatar_url).toBe('https://signed.example.com/avatar.png');
  });

  it('normaliza URL assinada legada ao carregar', async () => {
    tableFrom.mockImplementation((table: string) => ({
      select: () => {
        const legacyRow = {
          ...profileRow,
          avatar_url: 'https://proj.supabase.co/storage/v1/object/sign/avatars/auth-1/avatar.png?token=abc',
        };
        const result = {
          data: table === 'profiles' ? [legacyRow] : [{ user_id: 'auth-1', role: 'agent' }],
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
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.fetchData();
    });

    expect(createSignedUrl).toHaveBeenCalledWith('auth-1/avatar.png', 300);
    expect(result.current.users[0].avatar_url).toBe('https://signed.example.com/avatar.png');
  });

  it('URL http de outra origem não é gravada em profiles.avatar_url', async () => {
    const { result } = renderHook(() => useAdminData('users'));

    await act(async () => {
      await result.current.handleSaveUser(buildUser('https://outro.exemplo.com/foto.png'), null);
    });

    expect(lastUpdate?.avatar_url).toBeNull();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});

describe('useAdminData — handleCreateUser com avatar (bucket privado)', () => {
  const storageFrom = supabase.storage.from as unknown as ReturnType<typeof vi.fn>;
  const tableFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
  const upload = vi.fn();
  const getPublicUrl = vi.fn();
  const createSignedUrl = vi.fn();
  const getSession = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/avatar.png' }, error: null });
    storageFrom.mockReturnValue({ upload, getPublicUrl, createSignedUrl });
    // fetchData pós-criação não importa aqui: perfis vazios, sem assinar nada.
    tableFrom.mockReturnValue({
      select: () => ({
        order: async () => ({ data: [], error: null }),
        in: async () => ({ data: [], error: null }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async () => ({ data: null, error: null }),
    });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    Object.assign(supabase.auth, { getSession });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('upload de avatar na criação grava o caminho <uuid>.<ext>, não a URL', async () => {
    const { result } = renderHook(() => useAdminData('users'));
    const file = new File(['avatar'], 'foto.jpg', { type: 'image/jpeg' });

    let ok = false;
    await act(async () => {
      ok = await result.current.handleCreateUser({
        name: 'Novo', email: 'novo@test.com', password: 'abcdef', role: 'agent', avatarFile: file,
      });
    });

    expect(ok).toBe(true);
    expect(upload).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('create-user');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.avatar_url).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('falha no upload da foto retorna false com toast e não chama a Edge', async () => {
    upload.mockResolvedValue({ error: { message: 'boom' } });
    const { result } = renderHook(() => useAdminData('users'));
    const file = new File(['avatar'], 'foto.png', { type: 'image/png' });

    let ok = true;
    await act(async () => {
      ok = await result.current.handleCreateUser({
        name: 'Novo', email: 'novo@test.com', password: 'abcdef', role: 'agent', avatarFile: file,
      });
    });

    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Erro ao fazer upload da foto');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
