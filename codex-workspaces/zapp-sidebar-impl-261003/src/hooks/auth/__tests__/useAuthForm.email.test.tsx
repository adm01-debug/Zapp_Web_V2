/**
 * Regressão do achado medido em produção (03/10): o e-mail submetido vinha do DOM,
 * não do estado. Cenário A/B: o estado tem A (o usuário digitou), o DOM recebe B
 * sem disparar eventos — que é exatamente o que o autofill do browser faz.
 *
 * Medição em produção, com o código antigo: a requisição `auth-login` saiu com **B**.
 * Aqui o mesmo cenário em unidade: tem de sair com **A**.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAuthForm } from '@/hooks/auth/useAuthForm';

const A = 'quem.digitou@promobrindes.com.br';
const B = 'sobra.de.autofill@promobrindes.com.br';
const SENHA = 'SenhaForte1!';

const signIn = vi.fn(async () => ({ error: null, via: 'edge' as const, lock: null }));

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
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/loginAttempts', () => ({ clearLoginAttempts: vi.fn(), formatLockTime: () => '' }));
vi.mock('@/integrations/supabase/client', () => ({
  GOOGLE_OAUTH_ENABLED: false,
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } },
}));

/** Formulário mínimo com a mesma forma do real: campos controlados + submit. */
function FormularioDeLogin() {
  const { formData, setFormData, handleLogin } = useAuthForm();
  return (
    <form onSubmit={handleLogin}>
      <input
        name="email"
        value={formData.email}
        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
      />
      <input
        name="password"
        value={formData.password}
        onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
      />
      <button type="submit">Entrar</button>
    </form>
  );
}

/** Escreve no DOM sem onChange — é o que o autofill faz. */
function injetarNoDom(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, valor);
}

describe('useAuthForm — de onde vem o e-mail submetido', () => {
  beforeEach(() => {
    signIn.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('CONTROLE: sem divergência, submete o que o usuário digitou', async () => {
    render(<FormularioDeLogin />);
    const email = document.querySelector('input[name="email"]') as HTMLInputElement;
    const senha = document.querySelector('input[name="password"]') as HTMLInputElement;
    fireEvent.change(email, { target: { value: A } });
    fireEvent.change(senha, { target: { value: SENHA } });

    await act(async () => {
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    });

    expect(signIn).toHaveBeenCalledWith(A, SENHA);
  });

  it('DOM divergindo do estado: submete o ESTADO (A), nunca a sobra do autofill (B)', async () => {
    render(<FormularioDeLogin />);
    const email = document.querySelector('input[name="email"]') as HTMLInputElement;
    const senha = document.querySelector('input[name="password"]') as HTMLInputElement;
    fireEvent.change(email, { target: { value: A } });
    fireEvent.change(senha, { target: { value: SENHA } });

    // autofill: o DOM passa a ter B e o estado React continua com A
    injetarNoDom(email, B);
    expect(email.value).toBe(B);
    expect(screen.getByDisplayValue(B)).toBeTruthy();

    await act(async () => {
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    });

    // Antes da correção isto era chamado com B (medido em produção).
    expect(signIn).toHaveBeenCalledWith(A, SENHA);
    expect(signIn).not.toHaveBeenCalledWith(B, expect.anything());
  });

  it('autofill em campo VAZIO continua funcionando: o DOM preenche o que o estado não tem', async () => {
    render(<FormularioDeLogin />);
    const email = document.querySelector('input[name="email"]') as HTMLInputElement;
    const senha = document.querySelector('input[name="password"]') as HTMLInputElement;
    fireEvent.change(senha, { target: { value: SENHA } });

    injetarNoDom(email, B); // estado vazio, DOM com B → o autofill é legítimo aqui

    await act(async () => {
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    });

    expect(signIn).toHaveBeenCalledWith(B, SENHA);
  });
});
