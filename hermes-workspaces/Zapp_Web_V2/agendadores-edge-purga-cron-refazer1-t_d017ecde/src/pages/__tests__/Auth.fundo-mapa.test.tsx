/**
 * L1 — imagem do mapa-múndi como fundo da tela de login.
 *
 * Prova, na PÁGINA real (src/pages/Auth.tsx), o que o CRITÉRIO DE PRONTO pede:
 *  1. a camada do mapa existe como <img> e cobre a página (object-cover, centralizada);
 *  2. é decorativa: alt vazio, fora da árvore de acessibilidade (aria-hidden) e
 *     sem role de imagem exposto;
 *  3. não recebe foco: nada dentro da camada de fundo é focável (sem tabindex/controles);
 *  4. não captura cliques (pointer-events-none), ficando atrás do formulário;
 *  5. sem regressão: o conteúdo do login continua renderizando.
 *
 * Vermelho antes (Auth.tsx da base, sem a imagem de fundo); verde depois.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/auth/useAuthForm', () => ({
  useAuthForm: () => ({
    loading: false,
    activeTab: 'login',
    setActiveTab: vi.fn(),
    passkeyAvailable: false,
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

vi.mock('@/integrations/supabase/client', () => ({ GOOGLE_OAUTH_ENABLED: false }));

// Painéis vizinhos não são o alvo deste cartão (L2/L3) e pesam no jsdom.
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

describe('Auth — mapa-múndi como fundo (L1)', () => {
  it('renderiza a imagem do mapa cobrindo a página (object-cover)', () => {
    renderAuth();
    const img = screen.getByTestId('auth-fundo-mapa');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toContain('hero-worldmap');
    expect(img.className).toContain('object-cover');
    expect(img.className).toContain('h-full');
    expect(img.className).toContain('w-full');
  });

  it('é decorativa: alt vazio, aria-hidden e sem role de imagem', () => {
    renderAuth();
    const img = screen.getByTestId('auth-fundo-mapa');
    expect(img).toHaveAttribute('alt', '');
    expect(img.getAttribute('draggable')).toBe('false');
    expect(img.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('não recebe foco: nada na camada de fundo é focável', () => {
    renderAuth();
    const layer = screen.getByTestId('auth-fundo-mapa').closest('[aria-hidden="true"]');
    expect(layer).not.toBeNull();
    expect(screen.getByTestId('auth-fundo-mapa')).not.toHaveAttribute('tabindex');
    expect(
      layer!.querySelectorAll('a, button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
  });

  it('não captura cliques (fica atrás do conteúdo, pointer-events-none)', () => {
    renderAuth();
    const layer = screen.getByTestId('auth-fundo-mapa').closest('[aria-hidden="true"]');
    expect(layer?.className).toContain('pointer-events-none');
  });

  it('mantém o conteúdo do login renderizado (sem regressão)', () => {
    renderAuth();
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar/ })).toBeInTheDocument();
  });
});
