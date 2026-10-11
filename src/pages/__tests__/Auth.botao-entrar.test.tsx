/**
 * L3 — botão "Entrar" do /auth: o rótulo e a seta na MESMA linha.
 *
 * Prova, na PÁGINA real (src/pages/Auth.tsx), que o botão de submit é um
 * contêiner flex EM LINHA (`inline-flex`), centrado nos dois eixos, com o texto
 * "Entrar" e o ícone da seta como filhos diretos do mesmo botão. Sem o
 * `inline-flex` o RippleButton (que é `display:inline-flex` só quando a classe
 * existe) cai para bloco e a seta vai para a linha de baixo em telas estreitas.
 *
 * A medição de geometria no navegador real (o ícone cruza verticalmente a caixa
 * do rótulo em 360/768/1280) está em e2e/auth.spec.ts.
 *
 * Vermelho antes (Auth.tsx da base, botão só com `group w-full`); verde depois.
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

describe('Auth — botão Entrar com rótulo e seta na mesma linha (L3)', () => {
  it('o botão Entrar é um flex em linha centrado (inline-flex + items-center + justify-center)', () => {
    renderAuth();
    const botao = screen.getByRole('button', { name: /^entrar$/i });
    const classes = botao.className.split(/\s+/);
    expect(classes, botao.className).toContain('inline-flex');
    expect(classes, botao.className).toContain('items-center');
    expect(classes, botao.className).toContain('justify-center');
  });

  it('a seta é filha direta do mesmo botão do rótulo Entrar', () => {
    renderAuth();
    const botao = screen.getByRole('button', { name: /^entrar$/i });
    const svg = botao.querySelector('svg');
    expect(svg, 'botão Entrar sem ícone de seta').not.toBeNull();
    // Mesmo contêiner: o ícone está dentro do botão, e o botão tem o rótulo.
    expect(svg!.closest('button')).toBe(botao);
    expect(botao.textContent).toMatch(/entrar/i);
    // Ícone sem rótulo acessível próprio: o nome do botão vem do texto "Entrar".
    expect(svg!.getAttribute('aria-hidden')).not.toBe('false');
  });

  it('sem regressão: o rótulo visível continua sendo exatamente "Entrar"', () => {
    renderAuth();
    const botao = screen.getByRole('button', { name: /^entrar$/i });
    const texto = Array.from(botao.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => (n.textContent ?? '').trim())
      .join(' ');
    expect(texto).toBe('Entrar');
  });
});
