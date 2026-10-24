/**
 * Botão "Entrar" da tela de login (/auth): a seta tem de ficar AO LADO do
 * rótulo, na mesma linha, com o conjunto centralizado (padrão da V3).
 *
 * Prova, na PÁGINA real (src/pages/Auth.tsx):
 *  1. o botão de envio é um contêiner flex em linha
 *     (`inline-flex items-center justify-center`) — sem isso a seta cai para
 *     uma linha separada;
 *  2. o ícone ArrowRight é IRMÃO do texto "Entrar" dentro desse contêiner
 *     (não está num bloco próprio), e o par continua centralizado;
 *  3. o deslocamento da seta no hover (`group-hover:translate-x-1`) segue de pé.
 *
 * Vermelho antes (classe da base sem `inline-flex items-center justify-center`
 * ou com o ícone fora do contêiner do rótulo); verde depois.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

/** O botão de envio do formulário de login. */
function botaoEntrar(): HTMLElement {
  return screen.getByRole('button', { name: 'Entrar' });
}

describe('Auth — seta do botão Entrar na mesma linha do rótulo', () => {
  it('o botão de envio é um flex em linha, com o conteúdo centralizado', () => {
    renderAuth();
    const botao = botaoEntrar();
    const classes = botao.className.split(/\s+/);

    expect(classes, 'classe inline-flex no botão Entrar').toContain('inline-flex');
    expect(classes, 'classe items-center no botão Entrar').toContain('items-center');
    expect(classes, 'classe justify-center no botão Entrar').toContain('justify-center');
    expect(classes, 'largura cheia preservada').toContain('w-full');
  });

  it('o texto "Entrar" e o ícone ArrowRight são irmãos no mesmo contêiner', () => {
    renderAuth();
    const botao = botaoEntrar();

    const rotulo = Array.from(botao.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() === 'Entrar',
    );
    expect(rotulo, 'texto "Entrar" como filho direto do botão').toBeTruthy();

    const seta = Array.from(botao.children).find((el) => el.tagName.toLowerCase() === 'svg');
    expect(seta, 'ícone (svg) como filho direto do botão').toBeTruthy();

    // Irmãos diretos: a seta vem imediatamente depois do rótulo, no MESMO
    // contêiner — é isso que o `inline-flex` mantém na mesma linha.
    expect(rotulo!.nextSibling, 'seta logo depois do rótulo, no mesmo contêiner').toBe(seta);
    expect(seta!.parentElement).toBe(botao);
    expect(seta!.getAttribute('class') ?? '').toContain('lucide-arrow-right');
  });

  it('o deslocamento da seta no hover continua ligado ao botão', () => {
    renderAuth();
    const botao = botaoEntrar();
    const seta = Array.from(botao.children).find((el) => el.tagName.toLowerCase() === 'svg')!;

    expect(botao.className).toContain('group');
    expect(seta.getAttribute('class') ?? '').toContain('group-hover:translate-x-1');
    expect(seta.getAttribute('class') ?? '').toContain('ml-2');
  });
});
