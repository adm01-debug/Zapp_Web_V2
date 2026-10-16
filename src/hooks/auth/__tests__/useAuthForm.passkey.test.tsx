/**
 * Regressão do login com passkey (item #71 + PH-01): antes, `handlePasskeyLogin`
 * pedia o link de acesso por e-mail (`signInWithOtp`) e conferia uma sessão que
 * JÁ existisse — numa máquina sem sessão o usuário ouvia "Enviamos um link".
 * Agora a Edge (`verify-authentication`) valida a asserção e devolve um
 * `token_hash` de uso único; o hook troca esse token por sessão com
 * `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` e segue o destino
 * pós-login já existente. Nenhum e-mail de link é enviado.
 *
 * O teste exercita `handlePasskeyLogin` (hook real, via render) e cobre:
 *   - caminho padrão: token_hash trocado por sessão → anuncia e navega;
 *   - defeito: `verifyOtp` sem sessão → não anuncia, não navega, avisa;
 *   - `verifyOtp` com erro (token expirado/uso único) → erro sem vazar a conta;
 *   - passkey recusada → não chama `verifyOtp`;
 *   - resposta sem `token_hash` → não chama `verifyOtp`;
 *   - destino pós-login (`?next=`) é respeitado.
 *
 * Antes da correção `verifyOtp` NUNCA era chamado (o hook usava
 * `signInWithOtp`/`getSession`): o primeiro caso fica vermelho.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAuthForm } from '@/hooks/auth/useAuthForm';
import { toast } from '@/hooks/ui/use-toast';

const { estadoRota } = vi.hoisted(() => ({ estadoRota: { pathname: '/auth', search: '' } }));

const authenticateWithPasskey = vi.fn();
const verifyOtp = vi.fn();
const signInWithOtp = vi.fn();
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
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ ...estadoRota, hash: '', state: null }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/loginAttempts', () => ({ clearLoginAttempts: vi.fn(), formatLockTime: () => '' }));
vi.mock('@/integrations/supabase/client', () => ({
  GOOGLE_OAUTH_ENABLED: false,
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
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

describe('useAuthForm — passkey conclui a sessão com o token da Edge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estadoRota.pathname = '/auth';
    estadoRota.search = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('CAMINHO PADRÃO: token_hash trocado por sessão → anuncia e navega', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: true, token_hash: 'th-1', type: 'magiclink' });
    verifyOtp.mockResolvedValue({ data: { session: { user: { id: 'u-passkey-1' } } }, error: null });

    await acionarPasskey();

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'th-1', type: 'magiclink' });
    // nenhum link por e-mail é pedido
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(anunciouAutenticado()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('DEFEITO: verifyOtp sem sessão → não anuncia autenticado nem navega', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: true, token_hash: 'th-1', type: 'magiclink' });
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });

    await acionarPasskey();

    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('TOKEN EXPIRADO: verifyOtp devolve erro → erro em pt-BR sem vazar a conta', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: true, token_hash: 'th-1', type: 'magiclink' });
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'Token has expired or is invalid' } });

    await acionarPasskey();

    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    const destrutivo = toastMock.mock.calls
      .map(([arg]) => arg as { variant?: string; description?: string })
      .find((arg) => arg?.variant === 'destructive');
    expect(destrutivo).toBeTruthy();
    // a mensagem crua do provedor (que descreve o token/estado da conta) não sai
    expect(destrutivo?.description ?? '').not.toContain('expired');
    expect(destrutivo?.description ?? '').not.toContain('invalid');
  });

  it('CASO NEGADO: passkey recusada → não chama verifyOtp, não anuncia, não navega', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: false });

    await acionarPasskey();

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('resposta sem token_hash → não chama verifyOtp nem navega', async () => {
    authenticateWithPasskey.mockResolvedValue({ success: true });

    await acionarPasskey();

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(anunciouAutenticado()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('DESTINO PÓS-LOGIN: ?next= é respeitado depois da sessão', async () => {
    estadoRota.search = '?next=/inbox';
    authenticateWithPasskey.mockResolvedValue({ success: true, token_hash: 'th-1', type: 'magiclink' });
    verifyOtp.mockResolvedValue({ data: { session: { user: { id: 'u-passkey-1' } } }, error: null });

    await acionarPasskey();

    expect(navigate).toHaveBeenCalledWith('/inbox');
  });
});
