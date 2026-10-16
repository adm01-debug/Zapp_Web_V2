import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act, fireEvent, screen } from '@testing-library/react';

const mockCreateSignedUrl = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockUpload = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
        getPublicUrl: mockGetPublicUrl,
        upload: mockUpload,
      })),
    },
    from: vi.fn(() => ({
      update: (...args: unknown[]) => {
        (mockUpdate as (...a: unknown[]) => unknown)(...args);
        return { eq: mockEq };
      },
      eq: mockEq,
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    withFeedback: vi.fn((fn) => fn()),
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <button {...props}>{children}</button>,
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt} />,
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => <span className={className}>{children}</span>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Camera: () => <span data-testid="camera-icon" />,
  Loader2: () => <span data-testid="loader-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
}));

import { useAuth } from '@/hooks/auth/useAuth';
import { AvatarUpload, AVATAR_SIGNED_URL_TTL_SECONDS } from '@/components/settings/AvatarUpload';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

const makeUser = (id: string) => ({ id, email: 'test@example.com' });
const makeProfile = (avatarUrl: string | null) => ({ name: 'Test User', email: 'test@example.com', avatar_url: avatarUrl });

describe('AvatarUpload — signed URL e path storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/avatar.jpg' } });
    mockUpload.mockResolvedValue({ data: null, error: null });
    mockUpdate.mockResolvedValue({ error: null });
    mockEq.mockResolvedValue({ error: null });
  });

  it('chama createSignedUrl com expiração curta (não getPublicUrl) para exibir avatar de usuário autenticado', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser('user-1'), profile: makeProfile('user-1/avatar.jpg'), refreshProfile: vi.fn() });

    render(<AvatarUpload />);

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('user-1/avatar.jpg', AVATAR_SIGNED_URL_TTL_SECONDS);
    });

    expect(AVATAR_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(900);
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('não gera signed URL quando usuário não está autenticado (anon)', async () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, refreshProfile: vi.fn() });

    render(<AvatarUpload />);

    await waitFor(() => {
      expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    });
    expect(document.querySelector('img')?.getAttribute('src')).toBeFalsy();
  });

  it('bucket privado: quando a API nega a URL assinada, não exibe imagem (sem bytes para anônimo)', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    mockUseAuth.mockReturnValue({ user: makeUser('user-1'), profile: makeProfile('user-1/avatar.jpg'), refreshProfile: vi.fn() });

    render(<AvatarUpload />);

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalled();
    });
    expect(document.querySelector('img')?.getAttribute('src')).toBeFalsy();
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('armazena o caminho do arquivo (não a URL assinada) no perfil após upload', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser('user-1'), profile: makeProfile(null), refreshProfile: vi.fn() });

    render(<AvatarUpload />);

    const file = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ avatar_url: 'user-1/avatar.jpg' });
    });
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('normaliza URL pública legada para caminho antes de assinar (avatar não some)', async () => {
    mockUseAuth.mockReturnValue({
      user: makeUser('user-1'),
      profile: makeProfile('https://proj.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?t=123'),
      refreshProfile: vi.fn(),
    });

    render(<AvatarUpload />);

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('user-1/avatar.jpg', AVATAR_SIGNED_URL_TTL_SECONDS);
    });
    // Nunca passa a URL http direto ao signer nem usa URL pública para exibir
    for (const [path] of mockCreateSignedUrl.mock.calls) {
      expect(path).not.toMatch(/^https?:\/\//);
    }
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://signed.example.com/avatar.jpg');
  });

  it('normaliza URL assinada legada para caminho antes de assinar', async () => {
    mockUseAuth.mockReturnValue({
      user: makeUser('user-1'),
      profile: makeProfile('https://proj.supabase.co/storage/v1/object/sign/avatars/user-1/avatar.jpg?token=abc'),
      refreshProfile: vi.fn(),
    });

    render(<AvatarUpload />);

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('user-1/avatar.jpg', AVATAR_SIGNED_URL_TTL_SECONDS);
    });
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('reassina e atualiza a prévia logo após trocar a foto (caminho fixo)', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example.com/avatar-novo.jpg' } });
    mockUseAuth.mockReturnValue({ user: makeUser('user-1'), profile: makeProfile(null), refreshProfile: vi.fn() });

    render(<AvatarUpload />);

    const file = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('user-1/avatar.jpg', AVATAR_SIGNED_URL_TTL_SECONDS);
    });
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://signed.example.com/avatar-novo.jpg');
  });

  it('limpa a prévia quando avatar_url vira null ou o usuário sai', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser('user-1'), profile: makeProfile('user-1/avatar.jpg'), refreshProfile: vi.fn() });

    const { rerender } = render(<AvatarUpload />);

    await waitFor(() => {
      expect(document.querySelector('img')?.getAttribute('src')).toBeTruthy();
    });

    mockUseAuth.mockReturnValue({ user: makeUser('user-1'), profile: makeProfile(null), refreshProfile: vi.fn() });
    rerender(<AvatarUpload />);

    await waitFor(() => {
      expect(document.querySelector('img')?.getAttribute('src')).toBeFalsy();
    });

    mockUseAuth.mockReturnValue({ user: null, profile: null, refreshProfile: vi.fn() });
    rerender(<AvatarUpload />);

    await waitFor(() => {
      expect(document.querySelector('img')?.getAttribute('src')).toBeFalsy();
    });
  });

  it('fluxo real de remoção: botão Remover grava null e limpa a prévia', async () => {
    const refreshProfile = vi.fn();
    mockUseAuth.mockReturnValue({ user: makeUser('user-1'), profile: makeProfile('user-1/avatar.jpg'), refreshProfile });

    render(<AvatarUpload />);

    const removeButton = await screen.findByText('Remover');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ avatar_url: null });
    });
    expect(refreshProfile).toHaveBeenCalled();
    expect(document.querySelector('img')?.getAttribute('src')).toBeFalsy();
  });
});
