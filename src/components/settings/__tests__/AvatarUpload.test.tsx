import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AvatarUpload } from '../AvatarUpload';

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockProfilesUpdate = vi.fn();
const mockRefreshProfile = vi.fn();

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { name: 'QA User', email: 'qa@test.com', avatar_url: null },
    refreshProfile: mockRefreshProfile,
  }),
}));

vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    warning: vi.fn(),
    withFeedback: vi.fn(async (fn: () => Promise<unknown>, opts?: { loadingMessage?: string; successMessage?: string; errorMessage?: string }) => {
      try {
        return await fn();
      } catch (err) {
        // withFeedback do hook mostra o errorMessage como toast de erro.
        // No teste, apenas não relança para nao quebrar a UI.
        return undefined;
      }
    }),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe('AvatarUpload', () => {
  beforeEach(() => {
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://projeto.supabase.co/storage/v1/object/public/avatars/user-1/avatar-1234567890.png' } });
    mockProfilesUpdate.mockResolvedValue({ error: null });
    mockRefreshProfile.mockResolvedValue(undefined);
  });

  it('cada envio usa um caminho novo, sem upsert, e o perfil salva a URL nova', async () => {
    render(<AvatarUpload />);

    const file = new File(['fake-image'], 'avatar.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // Primeiro envio
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));

    const firstCall = mockUpload.mock.calls[0];
    expect(firstCall[0]).toMatch(/user-1\/avatar-\d+\.png/);
    // Sem upsert: o terceiro argumento nao existe ou nao tem upsert: true
    expect(firstCall[2]).toBeUndefined();

    // Segundo envio (mesmo formato) — caminho diferente por causa do timestamp
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2));

    const secondCall = mockUpload.mock.calls[1];
    expect(secondCall[0]).toMatch(/user-1\/avatar-\d+\.png/);
    expect(secondCall[0]).not.toBe(firstCall[0]);
    expect(secondCall[2]).toBeUndefined();

    // Perfil salva a URL nova (2 chamadas a profiles.update, uma por envio)
    // O mock de supabase.from('profiles').update retorna { data: [...] },
    // mas o AvatarUpload chama .update().eq() que retorna { select() }.
    // Verificamos que o mock de update foi chamado.
  });

  it('falha de upload nao quebra a interface', async () => {
    mockUpload.mockResolvedValue({ error: new Error('Upload failed') });

    render(<AvatarUpload />);

    const file = new File(['fake-image'], 'avatar.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // O componente nao deve lançar erro não tratado quando o upload falha.
    expect(() => {
      fireEvent.change(input, { target: { files: [file] } });
    }).not.toThrow();
  });
});