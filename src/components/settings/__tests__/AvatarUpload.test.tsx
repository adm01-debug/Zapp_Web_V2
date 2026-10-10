import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act, fireEvent } from '@testing-library/react';

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
      update: mockUpdate.mockReturnThis(),
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
import { AvatarUpload } from '@/components/settings/AvatarUpload';

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

  it('chama createSignedUrl (não getPublicUrl) para exibir avatar de usuário autenticado', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser('user-1'), profile: makeProfile('avatars/user-1/avatar.jpg'), refreshProfile: vi.fn() });

    render(<AvatarUpload />);

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('avatars/user-1/avatar.jpg', 3600);
    });

    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('não gera signed URL quando usuário não está autenticado (anon)', async () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, refreshProfile: vi.fn() });

    render(<AvatarUpload />);

    await waitFor(() => {
      expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    });
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
  });
});