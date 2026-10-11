/**
 * Rede de segurança da TELA INTEIRA do /auth (L1–L4 do plano de 11/10/2026).
 *
 * Os cartões pai provaram cada pedaço isolado (fundo do mapa, painel esquerdo,
 * estatísticas, coluna da marca). Depois deles ninguém verifica que as quatro
 * peças aparecem JUNTAS na página real. Este arquivo monta o `Auth` de verdade,
 * com os componentes REAIS (HeroBenefits, SocialProof, marca, rodapé) — só a
 * fronteira é dublada: `useAuthForm` (o hook que fala com o Supabase), o
 * `GOOGLE_OAUTH_ENABLED` do cliente e o `useReducedMotion` do framer-motion.
 *
 * Cobre o CRITÉRIO DE PRONTO:
 *  1. as três regiões na mesma página: painel esquerdo V3 (título, 6 benefícios
 *     e a citação de Aristóteles), marca 'ZAPP Web' + subtítulo, estatísticas
 *     (10k+, 1M+, 99.9%, 100%) e rodapé 'Promo Brindes';
 *  2. abas Entrar/Criar Conta alternando (o clique chega em `setActiveTab` e o
 *     estado trocado mostra o formulário de cadastro);
 *  3. Passkey só com `passkeyAvailable`, Google só com `GOOGLE_OAUTH_ENABLED`,
 *     com os separadores 'ou'/'ou continue com';
 *  4. camada do mapa decorativa (dentro do `[aria-hidden="true"]`);
 *  5. axe sem violação no estado de login e no de cadastro;
 *  6. com `prefers-reduced-motion` a página monta e nada entra deslocado.
 *
 * vermelho antes: os textos/estatísticas da V3 e a marca centralizada não
 * existem no `Auth` da base (contexto de `git stash` da prova no relato).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';

// Estado controlável pelos testes (hoisted: usável dentro dos vi.mock).
const estado = vi.hoisted(() => ({
  passkeyAvailable: false,
  google: false,
  activeTab: 'login',
  reduceMotion: false,
  setActiveTab: vi.fn(),
}));

// O único pedaço do framer-motion que o teste precisa dirigir; o resto é real,
// então o DOM medido é o que a página de fato produz.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => estado.reduceMotion };
});

vi.mock('@/hooks/auth/useAuthForm', () => ({
  useAuthForm: () => ({
    loading: false,
    activeTab: estado.activeTab,
    setActiveTab: estado.setActiveTab,
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

import Auth from '@/pages/Auth';

const BENEFICIOS = [
  ['Inbox Unificado', 'Todas conversas em um só lugar'],
  ['IA Integrada', 'Respostas automáticas inteligentes'],
  ['Analytics Avançado', 'Métricas em tempo real'],
  ['Multi-agentes', 'Colaboração de equipe eficiente'],
  ['SLA Tracking', 'Monitore tempos de resposta'],
  ['Segurança Total', 'Dados criptografados'],
] as const;

const ESTATISTICAS = [
  ['10k+', 'Usuários ativos'],
  ['1M+', 'Mensagens/dia'],
  ['99.9%', 'Uptime'],
  ['100%', 'Seguro'],
] as const;

function pagina() {
  return (
    <MemoryRouter>
      <Auth />
    </MemoryRouter>
  );
}

beforeEach(() => {
  estado.passkeyAvailable = false;
  estado.google = false;
  estado.activeTab = 'login';
  estado.reduceMotion = false;
  estado.setActiveTab.mockClear();
});

describe('Auth — tela de login completa (V3)', () => {
  it('monta na MESMA página o painel esquerdo da V3, a marca, as estatísticas e o rodapé', () => {
    render(pagina());

    const main = screen.getByRole('main');
    expect(main.id).toBe('main-content');

    // Painel esquerdo (HeroBenefits real): título em duas linhas.
    const titulos = within(main).getAllByRole('heading', { name: 'Tudo que você precisa para' });
    expect(titulos.length).toBeGreaterThan(0);
    expect(within(main).getAllByText('atender com excelência').length).toBeGreaterThan(0);

    // Os 6 benefícios, cada um com a sua descrição, dentro do main.
    for (const [titulo, descricao] of BENEFICIOS) {
      expect(within(main).getAllByRole('heading', { name: titulo }).length).toBeGreaterThan(0);
      expect(within(main).getAllByText(descricao).length).toBeGreaterThan(0);
    }

    // A citação de Aristóteles.
    expect(within(main).getAllByText('Aristóteles').length).toBeGreaterThan(0);
    expect(within(main).getAllByText(/não é um ato, mas um\s+hábito/i).length).toBeGreaterThan(0);

    // Marca centralizada + subtítulo.
    expect(within(main).getByRole('heading', { name: 'ZAPP Web' })).toBeInTheDocument();
    expect(within(main).getByText('Plataforma omnichannel para atendimento')).toBeInTheDocument();

    // Faixa de estatísticas (SocialProof real).
    for (const [valor, rotulo] of ESTATISTICAS) {
      expect(within(main).getByText(valor)).toBeInTheDocument();
      expect(within(main).getByText(rotulo)).toBeInTheDocument();
    }

    // Rodapé com o ano corrente.
    const ano = new Date().getFullYear();
    expect(
      within(main).getByText(`© ${ano} Promo Brindes. Todos os direitos reservados.`),
    ).toBeInTheDocument();
  });

  it('mantém a camada do mapa como decoração (dentro do aria-hidden)', () => {
    render(pagina());

    const mapa = screen.getByTestId('auth-fundo-mapa');
    expect(mapa.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(mapa).toHaveAttribute('alt', '');
    // a camada decorativa não entra na árvore de acessibilidade
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('as abas Entrar/Criar Conta alternam: o clique avisa o hook e o estado trocado mostra o cadastro', () => {
    const { rerender } = render(pagina());

    // estado inicial: login
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Entrar' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Nome')).toBeNull();

    // o Radix Tabs ativa no mouseDown (ativação automática)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Criar Conta' }));
    expect(estado.setActiveTab).toHaveBeenCalledWith('signup');

    // o hook passa o novo estado: o formulário de cadastro entra no lugar do login
    estado.activeTab = 'signup';
    rerender(pagina());

    expect(screen.getByRole('tab', { name: 'Criar Conta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.queryByText('Esqueci minha senha')).toBeNull();
  });

  it('Passkey e Google entram só pela disponibilidade, cada um com o seu separador', () => {
    estado.passkeyAvailable = true;
    estado.google = true;
    render(pagina());

    expect(screen.getByRole('button', { name: 'Entrar com Passkey' })).toBeInTheDocument();
    expect(screen.getByText('ou')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
    expect(screen.getByText('ou continue com')).toBeInTheDocument();
  });

  it('sem Passkey e sem Google não sobra botão alternativo nem separador', () => {
    render(pagina());

    expect(screen.queryByRole('button', { name: 'Entrar com Passkey' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entrar com Google' })).toBeNull();
    expect(screen.queryByText('ou')).toBeNull();
    expect(screen.queryByText('ou continue com')).toBeNull();
  });

  it('não tem violação de axe no estado de login', async () => {
    const { container } = render(pagina());
    expect(await axe(container)).toHaveNoViolations();
  });

  it('não tem violação de axe no estado de cadastro', async () => {
    estado.activeTab = 'signup';
    const { container } = render(pagina());
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('com movimento reduzido a página monta e nada entra deslocado', () => {
    estado.reduceMotion = true;
    render(pagina());

    // a marca (que fora do modo reduzido entra com y:12) aparece no lugar
    const marca = screen.getByRole('heading', { name: 'ZAPP Web' }).parentElement as HTMLElement;
    expect(marca.style.transform).not.toContain('translate');

    // a faixa de estatísticas também não se desloca
    const faixa = screen.getByTestId('social-proof') as HTMLElement;
    expect(faixa.style.opacity).not.toBe('0');
    expect(faixa.style.transform).not.toContain('translate');

    // e a tela continua inteira
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();
  });

  it('a checagem de movimento reduzido é sensível: sem redução a marca entra deslocada', () => {
    estado.reduceMotion = false;
    render(pagina());

    const marca = screen.getByRole('heading', { name: 'ZAPP Web' }).parentElement as HTMLElement;
    expect(marca.style.transform).toContain('translate');
  });
});
