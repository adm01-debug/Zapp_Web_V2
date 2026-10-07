/**
 * Regressão do item #71 (área auth): o login com passkey anunciava
 * "Autenticado com Passkey!" e navegava para '/' apenas porque `signInWithOtp`
 * respondeu sem erro — e `signInWithOtp` só ENVIA o link de acesso por e-mail,
 * NÃO cria sessão. O usuário via "autenticado" sem sessão que provasse o login.
 *
 * O teste exercita `handlePasskeyLogin` (código real, via renderHook do próprio
 * hook) e cobre os três casos do cartão:
 *   - caminho padrão: passkey validada + sessão do MESMO usuário → anuncia e navega;
 *   - caso negado: passkey recusada → não envia OTP, não anuncia, não navega;
 *   - sessão de outra conta: existe sessão, mas de OUTRO usuário → não anuncia.
 * Também cobre "OTP enviado e nenhuma sessão" (o defeito: nada prova o login) e
 * "signInWithOtp falhou".
 *
 * Antes da correção os casos "sem sessão" e "sessão de outra conta" anunciavam
 * autenticação e navegavam (vermelho); depois, só o dono da sessão validada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAuthForm } from '@/hooks/auth/useAuthForm';
import { toast } from '@/hooks/ui/use-toast';

const USUARIO_DA_PASSKEY = 'u-passkey-1';
const OUTRA_CONTA = 'u-outra-2';

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

function BotaoPasskey() {
  const { handlePasskeyLogin } = useAuthForm();
  return <button onClick={handlePasskeyLogin}>Entrar com passkey</button>;
}

async function acionarPasskey() {
  render(<BotaoPasskey />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button'));
  });
}

function anunciouAutenticado() {
  return toastMock.mock.calls.some(([arg]) =>
    typeof arg === 'object' && arg !== null && String((arg as { title?: string }).title ?? '').includes('Autenticado'),
  );
}

describe('useAuthForm — passkey só anuncia login com a sessão do usuário validado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('CAMINHO PADRÃO: passkey validada e sessão do MESMO usuário → anuncia e navega', async () => {
    authenticateWithPasskey.mockResolvedValue({
      success: true,
      userId: USUARIO_DA_PASSKEY,
      userEmail: 'dono@example.test',
    });
    signInWithOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { user: { id: USUARIO_DA_PASSKEY } } }, error: null });

    await acionarPasskey();

    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'dono@example.test', options: expect.objectContaining({ shouldCreateUser: false }) }),
    );
    expect(anunciouAutenticado()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('DEFEITO: OTP enviado mas NENHUMA sessão → não anuncia autenticado nem navega', async () => {
    authenticateWithPasskey.mockResolvedValue({
      success: true,
      userId: USUARIO_DA_PASSKEY,
      userEmail: 'dono@example.test',
    });
    signInWithOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await acionarPasskey();

    // o link de acesso foi pedido (é o que o passkey consegue fazer sozinho)...
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    // ...mas sem sessão não há prova do login: nada de "Autenticado" nem de navegar.
    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    // e o usuário é informado do passo que falta.
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('SESSÃO DE OUTRA CONTA: sessão existe mas é de outro usuário → não anuncia nem navega', async () => {
    authenticateWithPasskey.mockResolvedValue({
      success: true,
      userId: USUARIO_DA_PASSKEY,
      userEmail: 'dono@example.test',
    });
    signInWithOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { user: { id: OUTRA_CONTA } } }, error: null });

    await acionarPasskey();

    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('CASO NEGADO: passkey recusada → não envia OTP, não anuncia, não navega, alerta o usuário', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: false });

    await acionarPasskey();

    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('passkey validada sem e-mail de conta → não envia OTP, não anuncia, não navega', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: true, userId: USUARIO_DA_PASSKEY });

    await acionarPasskey();

    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('falha ao enviar o link por e-mail → erro destrutivo, sem anunciar autenticação', async () => {
    authenticateWithPasskey.mockResolvedValue({
      success: true,
      userId: USUARIO_DA_PASSKEY,
      userEmail: 'dono@example.test',
    });
    signInWithOtp.mockResolvedValue({ error: { message: 'rate limit' } });

    await acionarPasskey();

    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', description: 'rate limit' }),
    );
  });
});
