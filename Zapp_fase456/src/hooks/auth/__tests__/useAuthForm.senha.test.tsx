/**
 * Decisão de produto (03/10): depois de um login RECUSADO, a senha sai do estado
 * E do DOM — o usuário redigita. O autofill continua valendo para o primeiro envio.
 *
 * O campo de senha aqui é **não controlado** de propósito, como o da tela real
 * (`PasswordInput`): é justamente por ele não seguir o estado que limpar só o
 * estado deixava a senha recusada no DOM — e o handler prefere o DOM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useAuthForm } from '@/hooks/auth/useAuthForm';
import { NETWORK_BLOCKED_MESSAGE } from '@/services/auth.service';
import { toast } from '@/hooks/ui/use-toast';

const EMAIL = 'quem.digitou@promobrindes.com.br';
const SENHA = 'SenhaForte1!';

/** Retorno de `useAuth().signIn` no que este arquivo observa. */
type RetornoDoSignIn = {
  error: { message: string } | null;
  via: 'edge';
  lock: null;
  /** Presente só quando a política de rede barrou o login (R2-AUTH-022). */
  networkBlocked?: boolean;
  unavailable?: boolean;
};

/** 1ª chamada recusa com senha inválida; as seguintes recusam igual (para contar). */
const signIn = vi.fn<() => Promise<RetornoDoSignIn>>(async () => ({
  error: { message: 'Invalid login credentials' },
  via: 'edge',
  lock: null,
}));

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
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: '/auth', search: '', hash: '', state: null }) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/loginAttempts', () => ({ clearLoginAttempts: vi.fn(), formatLockTime: () => '' }));
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
      {/* não controlado: o DOM não segue o estado — igual ao PasswordInput real */}
      <input name="password" onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))} />
      <button type="submit">Entrar</button>
    </form>
  );
}

const campo = (nome: string) => document.querySelector(`input[name="${nome}"]`) as HTMLInputElement;
const submeter = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
  });
};

describe('useAuthForm — senha depois de uma recusa', () => {
  beforeEach(() => {
    signIn.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('a recusa limpa a senha no campo do DOM (não só no estado)', async () => {
    render(<FormularioDeLogin />);
    fireEvent.change(campo('email'), { target: { value: EMAIL } });
    fireEvent.change(campo('password'), { target: { value: SENHA } });
    expect(campo('password').value).toBe(SENHA);

    await submeter(); // recusa

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(campo('password').value).toBe('');
  });

  it('A/B: o próximo envio não carrega a senha antiga', async () => {
    render(<FormularioDeLogin />);
    fireEvent.change(campo('email'), { target: { value: EMAIL } });
    fireEvent.change(campo('password'), { target: { value: SENHA } });

    await submeter(); // 1ª tentativa: recusada
    expect(signIn).toHaveBeenCalledTimes(1);

    await submeter(); // 2ª tentativa sem redigitar nada

    // A senha recusada não pode voltar: com o campo vazio a validação local barra
    // e não sai nova requisição. Antes da correção este segundo envio mandava SENHA
    // de novo e o signIn rodava duas vezes.
    // A contagem E a prova: antes da correcao este envio mandava a senha velha de novo.
    expect(signIn).toHaveBeenCalledTimes(1);
    const chamadas = signIn.mock.calls as unknown as [string, string][];
    expect(chamadas.filter((c) => c[1] === SENHA)).toHaveLength(1);
  });

  it('o primeiro envio continua usando o que o campo tem (autofill preservado)', async () => {
    render(<FormularioDeLogin />);
    fireEvent.change(campo('email'), { target: { value: EMAIL } });
    // autofill: senha chega no DOM sem onChange
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(campo('password'), SENHA);

    await submeter();

    expect(signIn).toHaveBeenCalledWith(EMAIL, SENHA);
  });

  /**
   * Cartão t_233ac6c3: quando a Edge nega por política de rede (403), a tela tem
   * de dizer que o acesso não passa DAQUELA rede — e nunca reaproveitar a
   * mensagem de indisponibilidade, que faz o usuário barrado tentar de novo.
   */
  it('403 da política de rede: a tela mostra o texto neutro, não o indisponível', async () => {
    signIn.mockResolvedValueOnce({
      error: new Error(NETWORK_BLOCKED_MESSAGE),
      via: 'edge',
      lock: null,
      networkBlocked: true,
      unavailable: false,
    });
    render(<FormularioDeLogin />);
    fireEvent.change(campo('email'), { target: { value: EMAIL } });
    fireEvent.change(campo('password'), { target: { value: SENHA } });

    await submeter();

    expect(toast).toHaveBeenCalledWith({
      title: 'Acesso bloqueado',
      description: 'Não foi possível entrar a partir desta rede. Fale com o administrador.',
      variant: 'destructive',
    });
    // A mensagem do "não deu para falar com a Edge" não pode ser a do bloqueio.
    expect(NETWORK_BLOCKED_MESSAGE).not.toContain('indisponível');
  });
});
