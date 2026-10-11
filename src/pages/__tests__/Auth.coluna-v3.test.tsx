/**
 * L4 — coluna direita do login com marca, botões e rodapé como na V3.
 *
 * Prova, na PÁGINA real (src/pages/Auth.tsx), o que o CRITÉRIO DE PRONTO pede:
 *  1. marca centralizada: título 'ZAPP Web' como heading, subtítulo
 *     'Plataforma omnichannel para atendimento' e ícone grande no quadrado
 *     com o gradiente primário do sistema;
 *  2. botões em largura total, na ordem da V3:
 *     'Entrar' -> 'OU' -> 'Entrar com Passkey' -> 'OU CONTINUE COM' -> 'Entrar com Google';
 *  3. cada separador só aparece quando existe botão depois dele;
 *  4. Passkey respeita passkeyAvailable e Google respeita GOOGLE_OAUTH_ENABLED;
 *  5. rodapé '© {ano atual} Promo Brindes. Todos os direitos reservados.';
 *  6. o SocialProof continua montado depois dos botões.
 *
 * Vermelho antes (Auth.tsx da base, marca compacta e botões lado a lado); verde depois.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Estado controlável pelos testes (hoisted para poder ser usado dentro dos vi.mock).
const estado = vi.hoisted(() => ({ passkeyAvailable: false, google: false }));

vi.mock('@/hooks/auth/useAuthForm', () => ({
  useAuthForm: () => ({
    loading: false,
    activeTab: 'login',
    setActiveTab: vi.fn(),
    passkeyAvailable: estado.passkeyAvailable,
    passkeyLoading: false,
    lockStatus: { isLocked: false, remainingTime: 0, attempts: 0 },
    formData: { name: '', email: '', password: '' },
    setFormData: vi.fn(),
    errors: {},
    handleLogin: vi.fn(),
    handleSignUp: vi.fn(),
    handlePasskeyLogin: vi.fn(),
    handleGoogleLogin: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  get GOOGLE_OAUTH_ENABLED() {
    return estado.google;
  },
}));

// Painéis vizinhos não são o alvo deste cartão (L2/L3) e pesam no jsdom.
vi.mock('@/components/auth/HeroBenefits', () => ({ HeroBenefits: () => null }));
vi.mock('@/components/auth/SocialProof', () => ({
  SocialProof: () => <div data-testid="social-proof" />,
}));

import Auth from '@/pages/Auth';

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

/** true quando `depois` aparece depois de `antes` no DOM. */
function vemDepois(depois: Element, antes: Element) {
  return Boolean(
    antes.compareDocumentPosition(depois) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

beforeEach(() => {
  estado.passkeyAvailable = false;
  estado.google = false;
});

describe('Auth — coluna do login (marca, botões e rodapé como na V3)', () => {
  it('mostra a marca centralizada com título, subtítulo e ícone no gradiente primário', () => {
    renderAuth();

    expect(screen.getByRole('heading', { name: 'ZAPP Web' })).toBeInTheDocument();
    expect(screen.getByText('Plataforma omnichannel para atendimento')).toBeInTheDocument();

    const gradiente = document.querySelector('[style*="var(--gradient-primary)"]');
    expect(gradiente).not.toBeNull();
    expect(gradiente!.className).toContain('rounded-[2rem]');
    // ícone grande (lucide Smartphone) dentro do quadrado
    expect(gradiente!.querySelector('svg')).not.toBeNull();

    // a marca compacta da V2 não existe mais
    expect(screen.queryByText('Suite v2')).toBeNull();
    expect(screen.queryByText('Seguro')).toBeNull();
    expect(screen.queryByText('Bem-vindo de volta')).toBeNull();
  });

  it('com Passkey e Google disponíveis, mostra botões full-width e separadores na ordem da V3', () => {
    estado.passkeyAvailable = true;
    estado.google = true;
    renderAuth();

    const entrar = screen.getByRole('button', { name: 'Entrar' });
    const sepOu = screen.getByText('ou');
    const passkey = screen.getByRole('button', { name: 'Entrar com Passkey' });
    const sepGoogle = screen.getByText('ou continue com');
    const google = screen.getByRole('button', { name: 'Entrar com Google' });

    expect(passkey.className).toContain('w-full');
    expect(google.className).toContain('w-full');
    expect(passkey.className).toContain('h-11');
    expect(google.className).toContain('h-11');

    const ordem = [entrar, sepOu, passkey, sepGoogle, google];
    for (let i = 1; i < ordem.length; i += 1) {
      expect(vemDepois(ordem[i], ordem[i - 1])).toBe(true);
    }

    const social = screen.getByTestId('social-proof');
    expect(vemDepois(social, google)).toBe(true);
  });

  it('sem Passkey e sem Google não mostra botões nem separadores', () => {
    renderAuth();

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar com Passkey' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entrar com Google' })).toBeNull();
    expect(screen.queryByText('ou')).toBeNull();
    expect(screen.queryByText('ou continue com')).toBeNull();
  });

  it('com só Passkey, aparece o separador OU e o botão de Passkey (sem o separador do Google)', () => {
    estado.passkeyAvailable = true;
    renderAuth();

    expect(screen.getByText('ou')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar com Passkey' })).toBeInTheDocument();
    expect(screen.queryByText('ou continue com')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entrar com Google' })).toBeNull();
  });

  it('com só Google, o separador OU do Passkey não aparece', () => {
    estado.google = true;
    renderAuth();

    expect(screen.queryByText('ou')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entrar com Passkey' })).toBeNull();
    expect(screen.getByText('ou continue com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
  });

  it('rodapé traz o ano atual com a assinatura Promo Brindes', () => {
    renderAuth();
    const ano = new Date().getFullYear();
    expect(
      screen.getByText(`© ${ano} Promo Brindes. Todos os direitos reservados.`),
    ).toBeInTheDocument();
  });

  it('mantém o formulário e as abas intactos (sem regressão)', () => {
    renderAuth();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Criar Conta' })).toBeInTheDocument();
  });
});
