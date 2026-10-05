/**
 * Regressão do cartão t_5a5e526f (R2-AUTH-002): o login com passkey anunciava
 * "Autenticado com Passkey!" e navegava para '/' logo após `signInWithOtp` —
 * que só ENVIA o link de acesso por e-mail, sem criar sessão. A ProtectedRoute
 * devolvia o usuário para /auth sem explicação.
 *
 * Agora: sem sessão em `getSession()`, o fluxo anuncia o estado real
 * ("link enviado por e-mail") e não navega; com sessão, segue o caminho do
 * login normal. Falha do passkey ou do OTP vira toast destrutivo, sem
 * anunciar autenticação nem navegar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAuthForm } from '@/hooks/auth/useAuthForm';
import { toast } from '@/hooks/ui/use-toast';

const authenticateWithPasskey = vi.fn();
const signInWithOtp = vi.fn();
const getSession = vi.fn();
const navigate = vi.fn();

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null, signIn: vi.fn(), signUp: vi.fn() }),
}));
vi.mock('@/hooks/auth/useWebAuthn', () => ({
  useWebAuthn: () => ({
    isSupported: () => false,
    isPlatformAuthenticatorAvailable: async () => false,
    authenticateWithPasskey,
    loading: false,
  }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/loginAttempts', () => ({ clearLoginAttempts: vi.fn(), formatLockTime: () => '' }));
vi.mock('@/integrations/supabase/client', () => ({
  GOOGLE_OAUTH_ENABLED: false,
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      getSession: () => getSession(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

const toastMock = vi.mocked(toast);

function GatilhoPasskey() {
  const { handlePasskeyLogin } = useAuthForm();
  return <button onClick={handlePasskeyLogin}>Entrar com passkey</button>;
}

async function acionarPasskey() {
  render(<GatilhoPasskey />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button'));
  });
}

describe('useAuthForm — passkey só anuncia login quando há sessão de fato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('OTP enviado mas SEM sessão: não navega, não anuncia autenticado, mostra o estado "link enviado"', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: true, userId: 'u1', userEmail: 'a@b.com' });
    signInWithOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await acionarPasskey();

    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.com' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Autenticado com Passkey!' }));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Passkey verificada' }));
  });

  it('OTP enviado e sessão JÁ presente: anuncia autenticado e navega', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: true, userId: 'u1', userEmail: 'a@b.com' });
    signInWithOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });

    await acionarPasskey();

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Autenticado com Passkey!' }));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('passkey cancelada/falhou (success:false): nenhum toast de autenticado, sem navegação', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: false });

    await acionarPasskey();

    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Autenticado com Passkey!' }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('signInWithOtp com erro: toast destrutivo, sem anunciar autenticado, sem navegação', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: true, userId: 'u1', userEmail: 'a@b.com' });
    signInWithOtp.mockResolvedValue({ error: { message: 'rate limit' } });

    await acionarPasskey();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao entrar com Passkey', variant: 'destructive' }),
    );
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Autenticado com Passkey!' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
});
