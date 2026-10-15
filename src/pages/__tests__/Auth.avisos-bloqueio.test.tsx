/**
 * Avisos de bloqueio e de tentativas restantes anunciados a leitores de tela
 * (src/pages/Auth.tsx).
 *
 * Prova, na PÁGINA real (src/pages/Auth.tsx) com o HOOK real
 * (src/hooks/auth/useAuthForm.ts), o que o CRITÉRIO DE PRONTO pede:
 *  1. o banner de bloqueio é uma região viva (role="alert") que anuncia UMA vez,
 *     já com a espera em minutos ("Aguarde 5 minutos antes de tentar novamente");
 *  2. a contagem mm:ss — que muda a cada segundo — fica FORA da região viva
 *     (aria-hidden), para não ser lida em laço;
 *  3. o banner de "N tentativas restantes antes do bloqueio" também é anunciado;
 *  4. o anúncio não revela se a conta existe (mesmo texto para qualquer e-mail).
 *
 * Vermelho antes (Auth.tsx da base não tem role="alert" nem a espera em minutos);
 * verde depois.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signIn = vi.fn();

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
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/loginAttempts', () => ({ clearLoginAttempts: vi.fn(), formatLockTime: () => '' }));
vi.mock('@/integrations/supabase/client', () => ({
  GOOGLE_OAUTH_ENABLED: false,
  supabase: { auth: {} },
}));
// Painéis vizinhos não são o alvo deste cartão e pesam no jsdom.
vi.mock('@/components/auth/HeroBenefits', () => ({ HeroBenefits: () => null }));
vi.mock('@/components/auth/SocialProof', () => ({ SocialProof: () => null }));

import Auth from '@/pages/Auth';

async function submeterLogin(email: string) {
  render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaForte1!' } });
  await act(async () => {
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
  });
}

describe('Auth — avisos de bloqueio e de tentativas anunciados', () => {
  beforeEach(() => {
    signIn.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('anuncia o bloqueio numa região viva, já com a espera em minutos', async () => {
    signIn.mockResolvedValueOnce({
      error: { message: 'Muitas tentativas de login. Aguarde alguns minutos.' },
      via: 'edge',
      lock: { isLocked: true, remainingTime: 300, attempts: 5 },
    });

    await submeterLogin('alguem@promobrindes.com.br');

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Conta bloqueada temporariamente');
    expect(alerta).toHaveTextContent('Aguarde 5 minutos antes de tentar novamente');
  });

  it('mantém a contagem mm:ss fora da região viva', async () => {
    signIn.mockResolvedValueOnce({
      error: { message: 'Muitas tentativas de login. Aguarde alguns minutos.' },
      via: 'edge',
      lock: { isLocked: true, remainingTime: 300, attempts: 5 },
    });

    await submeterLogin('alguem@promobrindes.com.br');

    const alerta = screen.getByRole('alert');
    expect(alerta).not.toHaveTextContent('5:00');

    const contagem = screen.getByTestId('auth-bloqueio-contagem');
    expect(contagem).toHaveTextContent('5:00');
    expect(contagem).toHaveAttribute('aria-hidden', 'true');
    expect(contagem.closest('[role="alert"]')).toBeNull();
  });

  it('anuncia as tentativas restantes antes do bloqueio', async () => {
    signIn.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
      via: 'edge',
      lock: { isLocked: false, remainingTime: 0, attempts: 3 },
    });

    await submeterLogin('alguem@promobrindes.com.br');

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('2 tentativas restantes antes do bloqueio');
  });

  it('congela o anúncio do bloqueio quando a contagem regressiva avança (300s → 239s)', async () => {
    vi.useFakeTimers();
    signIn.mockResolvedValueOnce({
      error: { message: 'Muitas tentativas de login. Aguarde alguns minutos.' },
      via: 'edge',
      lock: { isLocked: true, remainingTime: 300, attempts: 5 },
    });

    await submeterLogin('alguem@promobrindes.com.br');

    const antes = screen.getByRole('alert').textContent ?? '';
    expect(antes).toContain('5 minutos');

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    const depois = screen.getByRole('alert').textContent ?? '';
    expect(depois).toBe(antes);
    expect(depois).toContain('5 minutos');

    // A contagem visual continua andando, fora da região viva.
    expect(screen.getByTestId('auth-bloqueio-contagem')).toHaveTextContent('3:59');
  });

  it('não revela se a conta existe: o anúncio não muda com o e-mail', async () => {
    signIn.mockResolvedValue({
      error: { message: 'Muitas tentativas de login. Aguarde alguns minutos.' },
      via: 'edge',
      lock: { isLocked: true, remainingTime: 300, attempts: 5 },
    });

    await submeterLogin('existe@promobrindes.com.br');
    const comConta = screen.getByRole('alert').textContent ?? '';
    cleanup();

    await submeterLogin('nao-existe@gmail.com');
    const semConta = screen.getByRole('alert').textContent ?? '';

    expect(semConta).toBe(comConta);
    expect(semConta).not.toContain('gmail.com');
  });
});
