/**
 * Cartao: erro de senha mostra quantas tentativas restam.
 *
 * A Edge `auth-login` devolve `attempts` (falhas ja registradas) na recusa
 * 401/423. O hook deve usar SO esse valor para dizer quantas tentativas restam
 * antes do bloqueio — e o texto tem de ser o mesmo exista ou nao a conta, para
 * nao virar oraculo de e-mail cadastrado (enumeracao).
 *
 * Maximo de falhas antes do bloqueio = 5 (o mesmo `v_max_attempts` de
 * `record_failed_login` e o mesmo numero que o banner de `src/pages/Auth.tsx`
 * usa). Por isso: attempts=3 -> "2 tentativas restantes"; attempts=4 -> "1
 * tentativa restante".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useAuthForm } from '@/hooks/auth/useAuthForm';
import { toast } from '@/hooks/ui/use-toast';

const EMAIL = 'quem.digitou@promobrindes.com.br';
const SENHA = 'SenhaForte1!';

type Resposta = {
  error: { message: string } | null;
  via: 'edge' | 'direct';
  lock: { isLocked: boolean; remainingTime: number; attempts: number } | null;
};

const signIn = vi.fn<() => Promise<Resposta>>();

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null, signIn, signUp: vi.fn() }),
}));
vi.mock('@/hooks/auth/useWebAuthn', () => ({
  useWebAuthn: () => ({
    isSupported: () => false,
    isPlatformAuthenticatorAvailable: async () => false,
    authenticateWithPasskey: vi.fn(),
    loading: false,
  }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/auth', search: '', hash: '', state: null }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/loginAttempts', () => ({ clearLoginAttempts: vi.fn(), formatLockTime: () => '1 minuto' }));
vi.mock('@/integrations/supabase/client', () => ({
  GOOGLE_OAUTH_ENABLED: false,
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } },
}));

function FormularioDeLogin() {
  const { formData, setFormData, handleLogin } = useAuthForm();
  return (
    <form onSubmit={handleLogin}>
      <input
        name="email"
        value={formData.email}
        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
      />
      <input name="password" onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))} />
      <button type="submit">Entrar</button>
    </form>
  );
}

const preencher = (email: string) => {
  const campoEmail = document.querySelector('input[name="email"]') as HTMLInputElement;
  const campoSenha = document.querySelector('input[name="password"]') as HTMLInputElement;
  fireEvent.change(campoEmail, { target: { value: email } });
  fireEvent.change(campoSenha, { target: { value: SENHA } });
};

const submeter = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
  });
};

/** A descricao do ULTIMO toast disparado — e o texto que o usuario le. */
const descricaoDoErro = (): string => {
  const chamadas = (toast as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const ultima = chamadas[chamadas.length - 1]?.[0] as { description?: string } | undefined;
  return String(ultima?.description ?? '');
};

const recusaCom = (lock: Resposta['lock'], message = 'Invalid login credentials') => {
  signIn.mockResolvedValue({ error: { message }, via: 'edge', lock });
};

describe('useAuthForm — tentativas restantes no erro de senha', () => {
  beforeEach(() => {
    signIn.mockReset();
    (toast as unknown as { mockClear: () => void }).mockClear?.();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('recusa com attempts da Edge diz quantas tentativas restam', async () => {
    recusaCom({ isLocked: false, remainingTime: 0, attempts: 3 });
    render(<FormularioDeLogin />);
    preencher(EMAIL);
    await submeter();

    expect(descricaoDoErro()).toBe('Email ou senha incorretos. 2 tentativas restantes antes do bloqueio.');
  });

  it('usa singular com uma tentativa restante (attempts = 4)', async () => {
    recusaCom({ isLocked: false, remainingTime: 0, attempts: 4 });
    render(<FormularioDeLogin />);
    preencher(EMAIL);
    await submeter();

    expect(descricaoDoErro()).toBe('Email ou senha incorretos. 1 tentativa restante antes do bloqueio.');
  });

  it('nao inventa contador quando a Edge nao devolve lock', async () => {
    recusaCom(null, 'Login temporariamente indisponível. Tente novamente.');
    render(<FormularioDeLogin />);
    preencher(EMAIL);
    await submeter();

    expect(descricaoDoErro()).toBe('Login temporariamente indisponível. Tente novamente.');
    expect(descricaoDoErro()).not.toMatch(/tentativa/i);
  });

  it('rate limit (attempts = 0) tambem nao vira contador de senha', async () => {
    recusaCom({ isLocked: false, remainingTime: 0, attempts: 0 }, 'Muitas tentativas. Aguarde para tentar de novo.');
    render(<FormularioDeLogin />);
    preencher(EMAIL);
    await submeter();

    expect(descricaoDoErro()).toBe('Muitas tentativas. Aguarde para tentar de novo.');
  });

  it('conta bloqueada continua com a mensagem de bloqueio, sem contador', async () => {
    recusaCom({ isLocked: true, remainingTime: 60, attempts: 5 });
    render(<FormularioDeLogin />);
    preencher(EMAIL);
    await submeter();

    expect(descricaoDoErro()).toMatch(/bloqueada/);
    expect(descricaoDoErro()).not.toMatch(/restante/);
  });

  it('o texto nao revela o e-mail digitado (sem enumeracao)', async () => {
    recusaCom({ isLocked: false, remainingTime: 0, attempts: 1 });
    render(<FormularioDeLogin />);
    preencher(EMAIL);
    await submeter();

    const texto = descricaoDoErro();
    expect(texto).toBe('Email ou senha incorretos. 4 tentativas restantes antes do bloqueio.');
    expect(texto).not.toContain(EMAIL);
    expect(texto).not.toContain('@promobrindes.com.br');
  });
});
