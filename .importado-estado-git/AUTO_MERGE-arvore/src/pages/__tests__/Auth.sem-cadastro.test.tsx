/**
 * Cadastro público removido da tela de login (/auth).
 *
 * Prova, na PÁGINA real (src/pages/Auth.tsx) com o HOOK real
 * (src/hooks/auth/useAuthForm.ts), o que o CRITÉRIO DE PRONTO pede:
 *  1. não existe mais aba/botão/formulário de cadastro na tela;
 *  2. o login continua funcionando (digita e envia -> signIn é chamado);
 *  3. o caminho de cadastro não é acionável: signUp nunca é chamado.
 *
 * Vermelho antes (Auth.tsx da base ainda tem a aba "Criar Conta");
 * verde depois.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signIn = vi.fn(async () => ({ error: null, via: 'edge' as const, lock: null }));
const signUp = vi.fn(async () => ({ error: null }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null, signIn, signUp }),
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

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

describe('Auth — cadastro público removido', () => {
  beforeEach(() => {
    signIn.mockClear();
    signUp.mockClear();
  });

  it('não expõe aba, título nem formulário de cadastro', () => {
    renderAuth();
    expect(screen.queryByRole('tab', { name: 'Criar Conta' })).toBeNull();
    expect(screen.queryByText('Criar Conta')).toBeNull();
    expect(screen.queryByText(/Crie sua conta/)).toBeNull();
    expect(screen.queryByLabelText('Nome')).toBeNull();
    expect(document.querySelector('#signup-email')).toBeNull();
    expect(document.querySelector('#signup-password')).toBeNull();
  });

  it('mantém só o formulário de login (nenhum segundo formulário na tela)', () => {
    renderAuth();
    const forms = document.querySelectorAll('form');
    expect(forms).toHaveLength(1);
    expect(document.querySelector('#login-email')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Entrar/ })).toBeInTheDocument();
  });

  it('o login continua: digita e envia -> signIn é chamado, signUp nunca', async () => {
    renderAuth();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'quem.digitou@promobrindes.com.br' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'SenhaForte1!' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    });

    expect(signIn).toHaveBeenCalledWith('quem.digitou@promobrindes.com.br', 'SenhaForte1!');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('mostra o texto de apoio do acesso administrado', () => {
    renderAuth();
    expect(
      screen.getByText(/Peça ao administrador da sua equipe/i),
    ).toBeInTheDocument();
  });
});
